<?php
if (!defined('ABSPATH')) {
  exit;
}

class SSDTF_Rewards_Points {
  public static function init() {
    add_action('woocommerce_order_status_completed', array(__CLASS__, 'on_completed'), 20, 1);
    add_action('woocommerce_order_status_cancelled', array(__CLASS__, 'on_cancelled_or_refunded'), 20, 1);
    add_action('woocommerce_order_status_failed', array(__CLASS__, 'on_cancelled_or_refunded'), 20, 1);
    add_action('woocommerce_order_status_refunded', array(__CLASS__, 'on_cancelled_or_refunded'), 20, 1);
    add_action('woocommerce_order_partially_refunded', array(__CLASS__, 'on_partial_refund'), 20, 2);
    add_action('user_register', array(__CLASS__, 'on_user_register'), 20, 1);
  }

  public static function balance($user_id) {
    global $wpdb;
    $user_id = intval($user_id);
    if ($user_id <= 0) {
      return 0;
    }
    $table = SSDTF_Rewards_DB::ledger_table();
    $sum = $wpdb->get_var($wpdb->prepare("SELECT COALESCE(SUM(points),0) FROM {$table} WHERE user_id = %d", $user_id));
    return intval($sum);
  }

  public static function has_type_for_order($order_id, $type) {
    global $wpdb;
    $table = SSDTF_Rewards_DB::ledger_table();
    $id = $wpdb->get_var($wpdb->prepare(
      "SELECT id FROM {$table} WHERE order_id = %d AND type = %s LIMIT 1",
      intval($order_id),
      $type
    ));
    return !empty($id);
  }

  public static function has_bonus($user_id) {
    global $wpdb;
    $table = SSDTF_Rewards_DB::ledger_table();
    $id = $wpdb->get_var($wpdb->prepare(
      "SELECT id FROM {$table} WHERE user_id = %d AND type = 'bonus' LIMIT 1",
      intval($user_id)
    ));
    return !empty($id);
  }

  public static function insert_row($user_id, $type, $points, $note, $order_id = null, $admin_id = null) {
    global $wpdb;
    $user_id = intval($user_id);
    $points = intval($points);
    if ($user_id <= 0 || $points === 0) {
      return false;
    }
    // Idempotency for earn/redeem/reverse per order.
    if ($order_id && in_array($type, array('earn', 'redeem', 'reverse', 'redeem_return'), true)) {
      if (self::has_type_for_order($order_id, $type)) {
        return false;
      }
    }
    $ok = $wpdb->insert(
      SSDTF_Rewards_DB::ledger_table(),
      array(
        'user_id' => $user_id,
        'order_id' => $order_id ? intval($order_id) : null,
        'type' => $type,
        'points' => $points,
        'note' => substr(sanitize_text_field($note), 0, 255),
        'admin_id' => $admin_id ? intval($admin_id) : null,
        'created_at' => gmdate('Y-m-d H:i:s'),
      ),
      array('%d', '%d', '%s', '%d', '%s', '%d', '%s')
    );
    return (bool) $ok;
  }

  /** Eligible = subtotal − discounts (excl shipping, tax, fees). */
  public static function eligible_amount(WC_Order $order) {
    $subtotal = floatval($order->get_subtotal());
    $discount = floatval($order->get_discount_total());
    return max(0, $subtotal - $discount);
  }

  public static function points_for_eligible($eligible) {
    $rate = SSDTF_Rewards_Settings::get_float('ssdtf_earn_rate');
    return (int) floor(floatval($eligible) * $rate);
  }

  public static function on_completed($order_id) {
    if (!SSDTF_Rewards_Settings::get_bool('ssdtf_points_enabled')) {
      return;
    }
    $order = wc_get_order($order_id);
    if (!$order) {
      return;
    }
    $user_id = $order->get_customer_id();
    if ($user_id <= 0) {
      return;
    }

    $eligible = self::eligible_amount($order);
    $points = self::points_for_eligible($eligible);
    if ($points > 0 && !self::has_type_for_order($order_id, 'earn')) {
      self::insert_row(
        $user_id,
        'earn',
        $points,
        sprintf(__('Order #%s', 'ssdtf-rewards'), $order->get_order_number()),
        $order_id
      );
      $order->update_meta_data('_ssdtf_points_earned', $points);
      $order->save();
    }

    // Welcome bonus on first completed order.
    if (
      SSDTF_Rewards_Settings::get('ssdtf_welcome_trigger') === 'first_completed_order'
      && SSDTF_Rewards_Settings::get_int('ssdtf_welcome_bonus') > 0
      && !self::has_bonus($user_id)
    ) {
      self::insert_row(
        $user_id,
        'bonus',
        SSDTF_Rewards_Settings::get_int('ssdtf_welcome_bonus'),
        __('Welcome bonus', 'ssdtf-rewards'),
        $order_id
      );
    }
  }

  public static function on_user_register($user_id) {
    if (!SSDTF_Rewards_Settings::get_bool('ssdtf_points_enabled')) {
      return;
    }
    if (SSDTF_Rewards_Settings::get('ssdtf_welcome_trigger') !== 'registration') {
      return;
    }
    $bonus = SSDTF_Rewards_Settings::get_int('ssdtf_welcome_bonus');
    if ($bonus <= 0 || self::has_bonus($user_id)) {
      return;
    }
    self::insert_row($user_id, 'bonus', $bonus, __('Welcome bonus', 'ssdtf-rewards'));
  }

  public static function on_cancelled_or_refunded($order_id) {
    $order = wc_get_order($order_id);
    if (!$order) {
      return;
    }
    $user_id = $order->get_customer_id();
    if ($user_id <= 0) {
      return;
    }

    $earned = intval($order->get_meta('_ssdtf_points_earned'));
    if ($earned > 0 && !self::has_type_for_order($order_id, 'reverse')) {
      self::insert_row(
        $user_id,
        'reverse',
        -abs($earned),
        sprintf(__('Reversed Order #%s', 'ssdtf-rewards'), $order->get_order_number()),
        $order_id
      );
    }

    $redeemed = intval($order->get_meta('_ssdtf_points_redeemed'));
    if ($redeemed > 0 && !self::has_type_for_order($order_id, 'redeem_return')) {
      self::insert_row(
        $user_id,
        'redeem_return',
        abs($redeemed),
        sprintf(__('Returned points Order #%s', 'ssdtf-rewards'), $order->get_order_number()),
        $order_id
      );
    }
  }

  public static function on_partial_refund($order_id, $refund_id) {
    $order = wc_get_order($order_id);
    $refund = wc_get_order($refund_id);
    if (!$order || !$refund) {
      return;
    }
    $user_id = $order->get_customer_id();
    if ($user_id <= 0) {
      return;
    }
    $rate = SSDTF_Rewards_Settings::get_float('ssdtf_earn_rate');
    $refund_amount = abs(floatval($refund->get_amount()));
    $to_reverse = (int) floor($refund_amount * $rate);
    $earned = intval($order->get_meta('_ssdtf_points_earned'));
    $already = self::sum_type_for_order($order_id, 'reverse');
    $remaining = max(0, $earned + $already); // already is negative
    $to_reverse = min($to_reverse, $remaining);
    if ($to_reverse <= 0) {
      return;
    }
    // Partial refunds: allow multiple reverse rows — use adjust-like note; skip unique check by using type reverse only once fully.
    // Spec: reverse proportionally. Use type reverse only if not fully reversed; otherwise allow via note uniqueness.
    global $wpdb;
    $wpdb->insert(
      SSDTF_Rewards_DB::ledger_table(),
      array(
        'user_id' => $user_id,
        'order_id' => intval($order_id),
        'type' => 'reverse',
        'points' => -abs($to_reverse),
        'note' => sprintf(__('Partial refund Order #%s', 'ssdtf-rewards'), $order->get_order_number()),
        'admin_id' => null,
        'created_at' => gmdate('Y-m-d H:i:s'),
      ),
      array('%d', '%d', '%s', '%d', '%s', '%d', '%s')
    );
  }

  public static function sum_type_for_order($order_id, $type) {
    global $wpdb;
    $table = SSDTF_Rewards_DB::ledger_table();
    return intval($wpdb->get_var($wpdb->prepare(
      "SELECT COALESCE(SUM(points),0) FROM {$table} WHERE order_id = %d AND type = %s",
      intval($order_id),
      $type
    )));
  }

  public static function available_redeem_value($user_id, $cart_subtotal) {
    $balance = self::balance($user_id);
    if ($balance <= 0) {
      return array('blocks' => 0, 'points' => 0, 'value' => 0.0);
    }
    $block_pts = SSDTF_Rewards_Settings::get_int('ssdtf_redeem_points');
    $block_val = SSDTF_Rewards_Settings::get_float('ssdtf_redeem_value');
    $max_pct = SSDTF_Rewards_Settings::get_float('ssdtf_redeem_max_pct') / 100.0;
    $max_by_balance = (int) floor($balance / $block_pts);
    $max_value_by_cart = floatval($cart_subtotal) * $max_pct;
    $max_by_cart = $block_val > 0 ? (int) floor($max_value_by_cart / $block_val) : 0;
    $blocks = max(0, min($max_by_balance, $max_by_cart));
    return array(
      'blocks' => $blocks,
      'points' => $blocks * $block_pts,
      'value' => $blocks * $block_val,
    );
  }

  public static function dollar_value_of_points($points) {
    $block_pts = SSDTF_Rewards_Settings::get_int('ssdtf_redeem_points');
    $block_val = SSDTF_Rewards_Settings::get_float('ssdtf_redeem_value');
    if ($block_pts <= 0) {
      return 0.0;
    }
    return (floor(intval($points) / $block_pts)) * $block_val;
  }

  public static function expire_stale_balances() {
    global $wpdb;
    $months = SSDTF_Rewards_Settings::get_int('ssdtf_points_expiry_months');
    if ($months <= 0) {
      return;
    }
    $cutoff = gmdate('Y-m-d H:i:s', strtotime('-' . $months . ' months'));
    $ledger = SSDTF_Rewards_DB::ledger_table();
    $user_ids = $wpdb->get_col("SELECT DISTINCT user_id FROM {$ledger}");
    foreach ($user_ids as $uid) {
      $uid = intval($uid);
      $bal = self::balance($uid);
      if ($bal <= 0) {
        continue;
      }
      $last = self::last_order_completed_at($uid);
      if ($last && $last > $cutoff) {
        continue;
      }
      if (!$last) {
        // No completed orders — still expire if oldest ledger older than cutoff.
        $oldest = $wpdb->get_var($wpdb->prepare(
          "SELECT MIN(created_at) FROM {$ledger} WHERE user_id = %d",
          $uid
        ));
        if ($oldest && $oldest > $cutoff) {
          continue;
        }
      }
      self::insert_row(
        $uid,
        'expire',
        -abs($bal),
        sprintf(
          /* translators: %d: months */
          __('Points expired (no orders in %d months)', 'ssdtf-rewards'),
          $months
        )
      );
      SSDTF_Rewards_Logger::log("Expired {$bal} points for user {$uid}");
    }
  }

  public static function last_order_completed_at($user_id) {
    $orders = wc_get_orders(array(
      'customer_id' => intval($user_id),
      'status' => array('completed'),
      'limit' => 1,
      'orderby' => 'date',
      'order' => 'DESC',
      'return' => 'objects',
    ));
    if (empty($orders)) {
      return null;
    }
    return gmdate('Y-m-d H:i:s', $orders[0]->get_date_completed() ? $orders[0]->get_date_completed()->getTimestamp() : $orders[0]->get_date_created()->getTimestamp());
  }

  public static function ledger_page($user_id, $page = 1, $per_page = 20) {
    global $wpdb;
    $table = SSDTF_Rewards_DB::ledger_table();
    $offset = max(0, (intval($page) - 1) * $per_page);
    $rows = $wpdb->get_results($wpdb->prepare(
      "SELECT * FROM {$table} WHERE user_id = %d ORDER BY created_at DESC, id DESC LIMIT %d OFFSET %d",
      intval($user_id),
      intval($per_page),
      $offset
    ), ARRAY_A);
    $total = intval($wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE user_id = %d", intval($user_id))));
    return array('rows' => $rows ?: array(), 'total' => $total);
  }
}
