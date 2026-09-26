<?php
if (!defined('ABSPATH')) {
  exit;
}

class SSDTF_Rewards_Admin {
  public static function init() {
    add_action('admin_menu', array(__CLASS__, 'menu'));
    add_action('show_user_profile', array(__CLASS__, 'user_profile'));
    add_action('edit_user_profile', array(__CLASS__, 'user_profile'));
    add_action('personal_options_update', array(__CLASS__, 'save_user_adjust'));
    add_action('edit_user_profile_update', array(__CLASS__, 'save_user_adjust'));
    add_action('add_meta_boxes', array(__CLASS__, 'order_metabox'));
  }

  public static function menu() {
    add_submenu_page(
      'woocommerce',
      __('South Side Rewards', 'ssdtf-rewards'),
      __('South Side Rewards', 'ssdtf-rewards'),
      'manage_woocommerce',
      'ssdtf-rewards',
      array(__CLASS__, 'render')
    );
  }

  public static function render() {
    if (!current_user_can('manage_woocommerce')) {
      return;
    }
    $tab = sanitize_key($_GET['tab'] ?? 'settings');
    echo '<div class="wrap"><h1>' . esc_html__('South Side Rewards', 'ssdtf-rewards') . '</h1>';
    echo '<nav class="nav-tab-wrapper">';
    foreach (array(
      'settings' => __('Settings', 'ssdtf-rewards'),
      'customers' => __('Customers', 'ssdtf-rewards'),
      'files' => __('Files', 'ssdtf-rewards'),
      'log' => __('Log', 'ssdtf-rewards'),
    ) as $key => $label) {
      $url = admin_url('admin.php?page=ssdtf-rewards&tab=' . $key);
      printf(
        '<a href="%s" class="nav-tab %s">%s</a>',
        esc_url($url),
        $tab === $key ? 'nav-tab-active' : '',
        esc_html($label)
      );
    }
    echo '</nav>';
    if ($tab === 'customers') {
      self::render_customers();
    } elseif ($tab === 'files') {
      self::render_files();
    } elseif ($tab === 'log') {
      echo '<p>' . esc_html__('Open WooCommerce → Status → Logs and filter source “ssdtf-rewards”.', 'ssdtf-rewards') . '</p>';
      echo '<p><a class="button" href="' . esc_url(admin_url('admin.php?page=wc-status&tab=logs')) . '">' . esc_html__('Open logs', 'ssdtf-rewards') . '</a></p>';
    } else {
      self::render_settings();
    }
    echo '</div>';
  }

  public static function render_settings() {
    if (isset($_POST['ssdtf_rewards_save']) && check_admin_referer('ssdtf_rewards_settings')) {
      $clean = SSDTF_Rewards_Settings::sanitize(wp_unslash($_POST['ssdtf_rewards_settings'] ?? array()));
      update_option(SSDTF_Rewards_Settings::OPTION, $clean);
      echo '<div class="updated"><p>' . esc_html__('Settings saved.', 'ssdtf-rewards') . '</p></div>';
    }
    $s = SSDTF_Rewards_Settings::get();
    echo '<form method="post">';
    wp_nonce_field('ssdtf_rewards_settings');
    echo '<table class="form-table">';
    self::row_checkbox('ssdtf_points_enabled', __('Points enabled', 'ssdtf-rewards'), $s['ssdtf_points_enabled'] === 'yes');
    self::row_number('ssdtf_earn_rate', __('Points earned per $1', 'ssdtf-rewards'), $s['ssdtf_earn_rate'], '0.01');
    self::row_number('ssdtf_redeem_points', __('Points per redemption block', 'ssdtf-rewards'), $s['ssdtf_redeem_points'], '1');
    self::row_number('ssdtf_redeem_value', __('$ value of one block', 'ssdtf-rewards'), $s['ssdtf_redeem_value'], '0.01');
    self::row_number('ssdtf_redeem_max_pct', __('Max % of order payable with points', 'ssdtf-rewards'), $s['ssdtf_redeem_max_pct'], '1');
    self::row_number('ssdtf_welcome_bonus', __('Welcome bonus points', 'ssdtf-rewards'), $s['ssdtf_welcome_bonus'], '1');
    echo '<tr><th>' . esc_html__('Welcome bonus trigger', 'ssdtf-rewards') . '</th><td>';
    echo '<select name="ssdtf_rewards_settings[ssdtf_welcome_trigger]">';
    foreach (array('first_completed_order' => 'First completed order', 'registration' => 'Registration') as $k => $lab) {
      printf('<option value="%s" %s>%s</option>', esc_attr($k), selected($s['ssdtf_welcome_trigger'], $k, false), esc_html($lab));
    }
    echo '</select></td></tr>';
    self::row_number('ssdtf_points_expiry_months', __('Points expire after N months of no orders', 'ssdtf-rewards'), $s['ssdtf_points_expiry_months'], '1');
    self::row_number('ssdtf_file_hold_days', __('File hold (days)', 'ssdtf-rewards'), $s['ssdtf_file_hold_days'], '1');
    self::row_number('ssdtf_archive_hold_days', __('Archive hold before delete (days)', 'ssdtf-rewards'), $s['ssdtf_archive_hold_days'], '1');
    self::row_checkbox('ssdtf_reminder_enabled', __('Expiry reminder email', 'ssdtf-rewards'), $s['ssdtf_reminder_enabled'] === 'yes');
    self::row_number('ssdtf_reminder_days', __('Reminder days before expiry', 'ssdtf-rewards'), $s['ssdtf_reminder_days'], '1');
    self::row_text('ssdtf_reorder_products', __('Reorderable product IDs', 'ssdtf-rewards'), $s['ssdtf_reorder_products']);
    self::row_text('ssdtf_relay_url', __('Vercel relay URL', 'ssdtf-rewards'), $s['ssdtf_relay_url']);
    echo '<tr><th>' . esc_html__('Relay HMAC secret', 'ssdtf-rewards') . '</th><td>';
    echo '<input type="password" class="regular-text" name="ssdtf_rewards_settings[ssdtf_relay_secret]" value="" autocomplete="new-password" placeholder="' . esc_attr__('Leave blank to reuse Gang Sheet Builder secret', 'ssdtf-rewards') . '" />';
    echo '</td></tr>';
    echo '</table>';
    echo '<p class="description"><strong>' . esc_html__('SiteGround cron:', 'ssdtf-rewards') . '</strong> ';
    echo esc_html__('WP-Cron only runs on page loads. In Site Tools → Devs → Cron Jobs, add every 15 minutes:', 'ssdtf-rewards');
    echo '<br /><code>wget -q -O - https://southsidedtf.com/wp-cron.php?doing_wp_cron &gt;/dev/null 2&gt;&amp;1</code><br />';
    echo esc_html__('and add define(\'DISABLE_WP_CRON\', true); to wp-config.php.', 'ssdtf-rewards');
    echo '</p>';
    submit_button(__('Save settings', 'ssdtf-rewards'), 'primary', 'ssdtf_rewards_save');
    echo '</form>';
  }

  private static function row_checkbox($key, $label, $checked) {
    echo '<tr><th>' . esc_html($label) . '</th><td>';
    printf('<label><input type="checkbox" name="ssdtf_rewards_settings[%s]" value="1" %s /> %s</label>', esc_attr($key), checked($checked, true, false), esc_html__('Enabled', 'ssdtf-rewards'));
    echo '</td></tr>';
  }

  private static function row_number($key, $label, $value, $step) {
    echo '<tr><th>' . esc_html($label) . '</th><td>';
    printf('<input type="number" step="%s" name="ssdtf_rewards_settings[%s]" value="%s" />', esc_attr($step), esc_attr($key), esc_attr($value));
    echo '</td></tr>';
  }

  private static function row_text($key, $label, $value) {
    echo '<tr><th>' . esc_html($label) . '</th><td>';
    printf('<input type="text" class="regular-text" name="ssdtf_rewards_settings[%s]" value="%s" />', esc_attr($key), esc_attr($value));
    echo '</td></tr>';
  }

  public static function render_customers() {
    global $wpdb;
    if (isset($_POST['ssdtf_adjust']) && check_admin_referer('ssdtf_adjust_points')) {
      $uid = intval($_POST['user_id'] ?? 0);
      $pts = intval($_POST['points'] ?? 0);
      $note = sanitize_text_field(wp_unslash($_POST['note'] ?? ''));
      if ($uid && $pts !== 0 && $note !== '') {
        SSDTF_Rewards_Points::insert_row($uid, 'adjust', $pts, $note, null, get_current_user_id());
        echo '<div class="updated"><p>' . esc_html__('Points adjusted.', 'ssdtf-rewards') . '</p></div>';
      } else {
        echo '<div class="error"><p>' . esc_html__('User, non-zero points, and a note are required.', 'ssdtf-rewards') . '</p></div>';
      }
    }

    $q = sanitize_text_field(wp_unslash($_GET['s'] ?? ''));
    echo '<form method="get"><input type="hidden" name="page" value="ssdtf-rewards" /><input type="hidden" name="tab" value="customers" />';
    echo '<p><input type="search" name="s" value="' . esc_attr($q) . '" placeholder="' . esc_attr__('Search name or email', 'ssdtf-rewards') . '" /> ';
    submit_button(__('Search', 'ssdtf-rewards'), 'secondary', '', false);
    echo '</p></form>';

    $args = array('number' => 40, 'orderby' => 'registered', 'order' => 'DESC');
    if ($q !== '') {
      $args['search'] = '*' . $q . '*';
      $args['search_columns'] = array('user_login', 'user_email', 'display_name');
    }
    $users = get_users($args);
    echo '<table class="widefat striped"><thead><tr><th>Customer</th><th>Balance</th><th>Lifetime earned</th><th>Last order</th><th>Adjust</th></tr></thead><tbody>';
    foreach ($users as $user) {
      $bal = SSDTF_Rewards_Points::balance($user->ID);
      $lifetime = intval($wpdb->get_var($wpdb->prepare(
        'SELECT COALESCE(SUM(points),0) FROM ' . SSDTF_Rewards_DB::ledger_table() . " WHERE user_id = %d AND points > 0",
        $user->ID
      )));
      $last = SSDTF_Rewards_Points::last_order_completed_at($user->ID);
      echo '<tr>';
      echo '<td><a href="' . esc_url(get_edit_user_link($user->ID)) . '">' . esc_html($user->display_name) . '</a><br /><small>' . esc_html($user->user_email) . '</small></td>';
      echo '<td>' . intval($bal) . '</td>';
      echo '<td>' . intval($lifetime) . '</td>';
      echo '<td>' . esc_html($last ? get_date_from_gmt($last, get_option('date_format')) : '—') . '</td>';
      echo '<td><form method="post">';
      wp_nonce_field('ssdtf_adjust_points');
      echo '<input type="hidden" name="user_id" value="' . intval($user->ID) . '" />';
      echo '<input type="number" name="points" placeholder="+/-" style="width:80px" /> ';
      echo '<input type="text" name="note" placeholder="' . esc_attr__('Note (required)', 'ssdtf-rewards') . '" /> ';
      echo '<button class="button" name="ssdtf_adjust" value="1">' . esc_html__('Adjust', 'ssdtf-rewards') . '</button>';
      echo '</form></td>';
      echo '</tr>';
    }
    echo '</tbody></table>';
  }

  public static function render_files() {
    global $wpdb;
    if (isset($_GET['restore']) && check_admin_referer('ssdtf_restore_' . $_GET['restore'])) {
      $res = SSDTF_Rewards_Files::restore(sanitize_text_field(wp_unslash($_GET['restore'])));
      if (is_wp_error($res)) {
        echo '<div class="error"><p>' . esc_html($res->get_error_message()) . '</p></div>';
      } else {
        echo '<div class="updated"><p>' . esc_html__('File restored.', 'ssdtf-rewards') . '</p></div>';
      }
    }
    $filter = sanitize_key($_GET['filter'] ?? 'active');
    $table = SSDTF_Rewards_DB::files_table();
    $where = '1=1';
    if ($filter === 'expiring') {
      $until = gmdate('Y-m-d H:i:s', time() + 7 * DAY_IN_SECONDS);
      $now = gmdate('Y-m-d H:i:s');
      $where = $wpdb->prepare("status = 'active' AND expires_at > %s AND expires_at <= %s", $now, $until);
    } elseif (in_array($filter, array('active', 'archived', 'deleted'), true)) {
      $where = $wpdb->prepare('status = %s', $filter);
    }
    $rows = $wpdb->get_results("SELECT * FROM {$table} WHERE {$where} ORDER BY expires_at ASC LIMIT 200", ARRAY_A);
    echo '<p>';
    foreach (array('active', 'archived', 'deleted', 'expiring') as $f) {
      printf(
        '<a class="button %s" href="%s">%s</a> ',
        $filter === $f ? 'button-primary' : '',
        esc_url(admin_url('admin.php?page=ssdtf-rewards&tab=files&filter=' . $f)),
        esc_html(ucfirst($f))
      );
    }
    echo '</p>';
    echo '<table class="widefat striped"><thead><tr><th>File</th><th>User</th><th>Status</th><th>Expires</th><th></th></tr></thead><tbody>';
    foreach ($rows ?: array() as $row) {
      $user = get_user_by('id', $row['user_id']);
      echo '<tr>';
      echo '<td>' . esc_html($row['filename']) . '<br /><code>' . esc_html($row['drive_file_id']) . '</code></td>';
      echo '<td>' . esc_html($user ? $user->user_email : $row['user_id']) . '</td>';
      echo '<td>' . esc_html($row['status']) . '</td>';
      echo '<td>' . esc_html(get_date_from_gmt($row['expires_at'], get_option('date_format'))) . '</td>';
      echo '<td>';
      if ($row['status'] === 'archived') {
        $url = wp_nonce_url(admin_url('admin.php?page=ssdtf-rewards&tab=files&restore=' . rawurlencode($row['drive_file_id'])), 'ssdtf_restore_' . $row['drive_file_id']);
        echo '<a class="button" href="' . esc_url($url) . '">' . esc_html__('Restore', 'ssdtf-rewards') . '</a>';
      }
      echo '</td></tr>';
    }
    echo '</tbody></table>';
  }

  public static function user_profile($user) {
    if (!current_user_can('manage_woocommerce')) {
      return;
    }
    $bal = SSDTF_Rewards_Points::balance($user->ID);
    echo '<h2>' . esc_html__('South Side Rewards', 'ssdtf-rewards') . '</h2>';
    echo '<table class="form-table"><tr><th>' . esc_html__('Points balance', 'ssdtf-rewards') . '</th><td><strong>' . intval($bal) . '</strong></td></tr>';
    echo '<tr><th>' . esc_html__('Adjust points', 'ssdtf-rewards') . '</th><td>';
    echo '<input type="number" name="ssdtf_adjust_points" value="" /> ';
    echo '<input type="text" name="ssdtf_adjust_note" class="regular-text" placeholder="' . esc_attr__('Note (required)', 'ssdtf-rewards') . '" />';
    echo '</td></tr></table>';
  }

  public static function save_user_adjust($user_id) {
    if (!current_user_can('manage_woocommerce')) {
      return;
    }
    $pts = intval($_POST['ssdtf_adjust_points'] ?? 0);
    $note = sanitize_text_field(wp_unslash($_POST['ssdtf_adjust_note'] ?? ''));
    if ($pts !== 0 && $note !== '') {
      SSDTF_Rewards_Points::insert_row($user_id, 'adjust', $pts, $note, null, get_current_user_id());
    }
  }

  public static function order_metabox() {
    $screens = array('shop_order');
    if (function_exists('wc_get_page_screen_id')) {
      $screens[] = wc_get_page_screen_id('shop-order');
    }
    foreach (array_unique($screens) as $screen) {
      add_meta_box('ssdtf_rewards_points', __('Rewards points', 'ssdtf-rewards'), array(__CLASS__, 'render_order_metabox'), $screen, 'side', 'default');
    }
  }

  public static function render_order_metabox($post_or_order) {
    $order = $post_or_order instanceof WC_Order ? $post_or_order : wc_get_order($post_or_order->ID);
    if (!$order) {
      return;
    }
    echo '<p>' . esc_html__('Earned:', 'ssdtf-rewards') . ' <strong>' . intval($order->get_meta('_ssdtf_points_earned')) . '</strong></p>';
    echo '<p>' . esc_html__('Redeemed:', 'ssdtf-rewards') . ' <strong>' . intval($order->get_meta('_ssdtf_points_redeemed')) . '</strong></p>';
  }
}
