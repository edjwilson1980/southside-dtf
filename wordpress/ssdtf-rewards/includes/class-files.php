<?php
if (!defined('ABSPATH')) {
  exit;
}

class SSDTF_Rewards_Files {
  public static function init() {
    foreach (array('processing', 'on-hold', 'completed') as $status) {
      add_action('woocommerce_order_status_' . $status, array(__CLASS__, 'track_order_files'), 25, 1);
    }
  }

  public static function track_order_files($order_id) {
    $order = wc_get_order($order_id);
    if (!$order) {
      return;
    }
    $user_id = $order->get_customer_id();
    if ($user_id <= 0) {
      return; // Guests: no file rows.
    }
    $reorderable = SSDTF_Rewards_Settings::reorder_product_ids();
    $hold_days = SSDTF_Rewards_Settings::get_int('ssdtf_file_hold_days');
    $now = gmdate('Y-m-d H:i:s');
    $expires = gmdate('Y-m-d H:i:s', time() + ($hold_days * DAY_IN_SECONDS));

    foreach ($order->get_items() as $item) {
      if (!$item instanceof WC_Order_Item_Product) {
        continue;
      }
      $product_id = $item->get_product_id();
      if (!in_array($product_id, $reorderable, true)) {
        continue;
      }
      $drive_id = (string) $item->get_meta('_ssdtf_drive_file_id', true);
      if ($drive_id === '') {
        $drive_id = (string) $item->get_meta('ssgs_drive_file_id', true);
      }
      if ($drive_id === '') {
        continue;
      }
      $length = floatval($item->get_meta('_ssdtf_length_in', true));
      if ($length <= 0) {
        $length = floatval($item->get_meta('ssgs_billed_height', true));
      }
      if ($length <= 0) {
        $length = floatval($item->get_meta('ssgs_printed_height', true));
      }
      $width = 22.0;
      $filename = (string) $item->get_meta('File', true);
      if ($filename === '') {
        $filename = (string) $item->get_meta('ssgs_print_file_name', true);
      }
      if ($filename === '') {
        $filename = $item->get_name();
      }

      self::upsert(array(
        'drive_file_id' => $drive_id,
        'user_id' => $user_id,
        'filename' => $filename,
        'product_id' => $product_id,
        'variation_id' => $item->get_variation_id(),
        'length_in' => $length,
        'width_in' => $width,
        'order_id' => $order->get_id(),
        'now' => $now,
        'expires_at' => $expires,
      ));
    }
  }

  public static function upsert(array $data) {
    global $wpdb;
    $table = SSDTF_Rewards_DB::files_table();
    $drive_id = sanitize_text_field($data['drive_file_id']);
    $user_id = intval($data['user_id']);
    $existing = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE drive_file_id = %s", $drive_id), ARRAY_A);

    if ($existing) {
      if (intval($existing['user_id']) !== $user_id) {
        SSDTF_Rewards_Logger::log(
          "Ownership mismatch for {$drive_id}: owned by {$existing['user_id']}, order user {$user_id}",
          'warning'
        );
        return false;
      }
      $wpdb->update(
        $table,
        array(
          'filename' => substr(sanitize_text_field($data['filename']), 0, 255),
          'product_id' => intval($data['product_id']),
          'variation_id' => intval($data['variation_id']),
          'length_in' => floatval($data['length_in']),
          'width_in' => floatval($data['width_in']),
          'last_order_id' => intval($data['order_id']),
          'last_ordered_at' => $data['now'],
          'expires_at' => $data['expires_at'],
          'status' => 'active',
          'archived_at' => null,
          'reminder_sent_at' => null,
        ),
        array('drive_file_id' => $drive_id),
        array('%s', '%d', '%d', '%f', '%f', '%d', '%s', '%s', '%s', '%s', '%s'),
        array('%s')
      );
      return true;
    }

    $wpdb->insert(
      $table,
      array(
        'drive_file_id' => $drive_id,
        'user_id' => $user_id,
        'filename' => substr(sanitize_text_field($data['filename']), 0, 255),
        'product_id' => intval($data['product_id']),
        'variation_id' => intval($data['variation_id']),
        'length_in' => floatval($data['length_in']),
        'width_in' => floatval($data['width_in']),
        'first_order_id' => intval($data['order_id']),
        'last_order_id' => intval($data['order_id']),
        'last_ordered_at' => $data['now'],
        'expires_at' => $data['expires_at'],
        'status' => 'active',
        'archived_at' => null,
        'reminder_sent_at' => null,
      ),
      array('%s', '%d', '%s', '%d', '%d', '%f', '%f', '%d', '%d', '%s', '%s', '%s', '%s', '%s')
    );
    return true;
  }

  public static function get($drive_file_id) {
    global $wpdb;
    return $wpdb->get_row(
      $wpdb->prepare('SELECT * FROM ' . SSDTF_Rewards_DB::files_table() . ' WHERE drive_file_id = %s', $drive_file_id),
      ARRAY_A
    );
  }

  public static function is_reorderable_for_user($drive_file_id, $user_id) {
    $row = self::get($drive_file_id);
    if (!$row) {
      return false;
    }
    return intval($row['user_id']) === intval($user_id) && $row['status'] === 'active';
  }

  public static function run_daily_maintenance() {
    self::send_reminders();
    self::archive_expired();
    self::delete_old_archives();
  }

  public static function send_reminders() {
    if (!SSDTF_Rewards_Settings::get_bool('ssdtf_reminder_enabled')) {
      return;
    }
    global $wpdb;
    $table = SSDTF_Rewards_DB::files_table();
    $days = SSDTF_Rewards_Settings::get_int('ssdtf_reminder_days');
    $now = gmdate('Y-m-d H:i:s');
    $until = gmdate('Y-m-d H:i:s', time() + ($days * DAY_IN_SECONDS));
    $rows = $wpdb->get_results($wpdb->prepare(
      "SELECT * FROM {$table} WHERE status = 'active' AND reminder_sent_at IS NULL AND expires_at > %s AND expires_at <= %s LIMIT 50",
      $now,
      $until
    ), ARRAY_A);
    foreach ($rows ?: array() as $row) {
      $sent = SSDTF_Rewards_Emails::send_expiry_reminder($row);
      if ($sent) {
        $wpdb->update(
          $table,
          array('reminder_sent_at' => gmdate('Y-m-d H:i:s')),
          array('drive_file_id' => $row['drive_file_id']),
          array('%s'),
          array('%s')
        );
      }
    }
  }

  public static function archive_expired() {
    global $wpdb;
    $table = SSDTF_Rewards_DB::files_table();
    $now = gmdate('Y-m-d H:i:s');
    $rows = $wpdb->get_results($wpdb->prepare(
      "SELECT * FROM {$table} WHERE status = 'active' AND expires_at < %s LIMIT 50",
      $now
    ), ARRAY_A);
    foreach ($rows ?: array() as $row) {
      $res = SSDTF_Rewards_Relay::post('/api/files/archive', array(
        'drive_file_id' => $row['drive_file_id'],
      ));
      if (is_wp_error($res)) {
        SSDTF_Rewards_Logger::log('Archive failed ' . $row['drive_file_id'] . ': ' . $res->get_error_message(), 'error');
        continue;
      }
      $wpdb->update(
        $table,
        array(
          'status' => 'archived',
          'archived_at' => gmdate('Y-m-d H:i:s'),
        ),
        array('drive_file_id' => $row['drive_file_id']),
        array('%s', '%s'),
        array('%s')
      );
      SSDTF_Rewards_Logger::log('Archived ' . $row['drive_file_id']);
    }
  }

  public static function delete_old_archives() {
    global $wpdb;
    $table = SSDTF_Rewards_DB::files_table();
    $days = SSDTF_Rewards_Settings::get_int('ssdtf_archive_hold_days');
    $cutoff = gmdate('Y-m-d H:i:s', time() - ($days * DAY_IN_SECONDS));
    $rows = $wpdb->get_results($wpdb->prepare(
      "SELECT * FROM {$table} WHERE status = 'archived' AND archived_at IS NOT NULL AND archived_at < %s LIMIT 50",
      $cutoff
    ), ARRAY_A);
    foreach ($rows ?: array() as $row) {
      $res = SSDTF_Rewards_Relay::post('/api/files/delete', array(
        'drive_file_id' => $row['drive_file_id'],
      ));
      if (is_wp_error($res)) {
        SSDTF_Rewards_Logger::log('Delete failed ' . $row['drive_file_id'] . ': ' . $res->get_error_message(), 'error');
        continue;
      }
      $wpdb->update(
        $table,
        array('status' => 'deleted'),
        array('drive_file_id' => $row['drive_file_id']),
        array('%s'),
        array('%s')
      );
      SSDTF_Rewards_Logger::log('Deleted ' . $row['drive_file_id']);
    }
  }

  public static function restore($drive_file_id) {
    global $wpdb;
    $row = self::get($drive_file_id);
    if (!$row || $row['status'] !== 'archived') {
      return new WP_Error('ssdtf_restore', __('Only archived files can be restored.', 'ssdtf-rewards'));
    }
    $res = SSDTF_Rewards_Relay::post('/api/files/restore', array(
      'drive_file_id' => $drive_file_id,
    ));
    if (is_wp_error($res)) {
      return $res;
    }
    $hold = SSDTF_Rewards_Settings::get_int('ssdtf_file_hold_days');
    $wpdb->update(
      SSDTF_Rewards_DB::files_table(),
      array(
        'status' => 'active',
        'archived_at' => null,
        'expires_at' => gmdate('Y-m-d H:i:s', time() + ($hold * DAY_IN_SECONDS)),
        'reminder_sent_at' => null,
      ),
      array('drive_file_id' => $drive_file_id),
      array('%s', '%s', '%s', '%s'),
      array('%s')
    );
    return true;
  }
}
