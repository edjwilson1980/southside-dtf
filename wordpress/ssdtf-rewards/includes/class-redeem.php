<?php
if (!defined('ABSPATH')) {
  exit;
}

class SSDTF_Rewards_Redeem {
  const COUPON_CODE = 'ssdtf-points';

  public static function init() {
    add_filter('woocommerce_get_shop_coupon_data', array(__CLASS__, 'virtual_coupon'), 10, 2);
    add_action('woocommerce_cart_calculate_fees', array(__CLASS__, 'noop'), 1); // keep class loaded
    add_action('woocommerce_before_cart', array(__CLASS__, 'render_apply_ui'));
    add_action('woocommerce_before_checkout_form', array(__CLASS__, 'render_apply_ui'), 5);
    add_action('wp_ajax_ssdtf_apply_points', array(__CLASS__, 'ajax_apply'));
    add_action('wp_ajax_ssdtf_remove_points', array(__CLASS__, 'ajax_remove'));
    add_action('woocommerce_checkout_order_processed', array(__CLASS__, 'on_order_processed'), 20, 3);
    add_action('woocommerce_store_api_checkout_order_processed', array(__CLASS__, 'on_store_api_order'), 20, 1);
    add_filter('woocommerce_cart_totals_coupon_label', array(__CLASS__, 'coupon_label'), 10, 2);
    add_action('woocommerce_check_cart_items', array(__CLASS__, 'validate_session_coupon'));
    // Block checkout Store API extension (basic cart item data).
    add_action('woocommerce_blocks_loaded', array(__CLASS__, 'register_blocks_integration'));
  }

  public static function noop() {}

  public static function session_blocks() {
    if (!WC()->session) {
      return 0;
    }
    return max(0, intval(WC()->session->get('ssdtf_redeem_blocks', 0)));
  }

  public static function set_session_blocks($blocks) {
    if (WC()->session) {
      WC()->session->set('ssdtf_redeem_blocks', max(0, intval($blocks)));
    }
  }

  public static function virtual_coupon($false, $data) {
    $code = is_string($data) ? $data : '';
    if (strtolower($code) !== self::COUPON_CODE) {
      return $false;
    }
    $blocks = self::session_blocks();
    if ($blocks <= 0) {
      return false;
    }
    $amount = $blocks * SSDTF_Rewards_Settings::get_float('ssdtf_redeem_value');
    return array(
      'id' => 0,
      'amount' => $amount,
      'discount_type' => 'fixed_cart',
      'individual_use' => false,
      'usage_limit' => '',
      'usage_count' => 0,
      'expiry_date' => '',
      'free_shipping' => false,
      'product_ids' => array(),
      'excluded_product_ids' => array(),
      'minimum_amount' => '',
      'maximum_amount' => '',
      'virtual' => true,
    );
  }

  public static function ensure_coupon_applied() {
    if (!WC()->cart) {
      return;
    }
    $blocks = self::session_blocks();
    $has = WC()->cart->has_discount(self::COUPON_CODE);
    if ($blocks > 0 && !$has) {
      WC()->cart->apply_coupon(self::COUPON_CODE);
    }
    if ($blocks <= 0 && $has) {
      WC()->cart->remove_coupon(self::COUPON_CODE);
    }
  }

  public static function validate_session_coupon() {
    if (!is_user_logged_in() || !WC()->cart) {
      return;
    }
    $user_id = get_current_user_id();
    $balance = SSDTF_Rewards_Points::balance($user_id);
    if ($balance <= 0) {
      self::set_session_blocks(0);
      self::ensure_coupon_applied();
      return;
    }
    $blocks = self::session_blocks();
    if ($blocks <= 0) {
      return;
    }
    $cap = SSDTF_Rewards_Points::available_redeem_value($user_id, WC()->cart->get_subtotal());
    if ($blocks > $cap['blocks']) {
      self::set_session_blocks($cap['blocks']);
    }
    self::ensure_coupon_applied();
  }

  public static function render_apply_ui() {
    if (!SSDTF_Rewards_Settings::get_bool('ssdtf_points_enabled') || !is_user_logged_in() || !WC()->cart) {
      return;
    }
    $user_id = get_current_user_id();
    $balance = SSDTF_Rewards_Points::balance($user_id);
    if ($balance <= 0) {
      echo '<div class="woocommerce-info ssdtf-points-box">' . esc_html__('You have 0 rewards points.', 'ssdtf-rewards') . '</div>';
      return;
    }
    $cap = SSDTF_Rewards_Points::available_redeem_value($user_id, WC()->cart->get_subtotal());
    $avail_value = SSDTF_Rewards_Points::dollar_value_of_points($balance);
    $current = self::session_blocks();
    $nonce = wp_create_nonce('ssdtf_points');
    echo '<div class="woocommerce-info ssdtf-points-box" style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">';
    printf(
      esc_html__('You have %1$d points (%2$s available).', 'ssdtf-rewards'),
      $balance,
      wp_strip_all_tags(wc_price($avail_value))
    );
    if ($cap['blocks'] > 0) {
      echo ' <label for="ssdtf-redeem-blocks">' . esc_html__('Apply points', 'ssdtf-rewards') . '</label> ';
      echo '<select id="ssdtf-redeem-blocks">';
      for ($b = 0; $b <= $cap['blocks']; $b++) {
        $pts = $b * SSDTF_Rewards_Settings::get_int('ssdtf_redeem_points');
        $val = $b * SSDTF_Rewards_Settings::get_float('ssdtf_redeem_value');
        printf(
          '<option value="%d" %s>%s</option>',
          $b,
          selected($current, $b, false),
          esc_html(sprintf('%d pts → %s', $pts, wp_strip_all_tags(wc_price($val))))
        );
      }
      echo '</select> ';
      echo '<button type="button" class="button" id="ssdtf-apply-points">' . esc_html__('Apply points', 'ssdtf-rewards') . '</button>';
      if ($current > 0) {
        echo ' <button type="button" class="button" id="ssdtf-remove-points">' . esc_html__('Remove', 'ssdtf-rewards') . '</button>';
      }
    }
    echo '</div>';
    $ajax = admin_url('admin-ajax.php');
    echo '<script>(function(){var sel=document.getElementById("ssdtf-redeem-blocks");var btn=document.getElementById("ssdtf-apply-points");var rm=document.getElementById("ssdtf-remove-points");function post(action,blocks){var fd=new FormData();fd.append("action",action);fd.append("nonce",' . wp_json_encode($nonce) . ');fd.append("blocks",String(blocks||0));fetch(' . wp_json_encode($ajax) . ',{method:"POST",body:fd,credentials:"same-origin"}).then(function(){location.reload();});}if(btn){btn.addEventListener("click",function(){post("ssdtf_apply_points",sel?sel.value:0);});}if(rm){rm.addEventListener("click",function(){post("ssdtf_remove_points",0);});}})();</script>';
  }

  public static function ajax_apply() {
    check_ajax_referer('ssdtf_points', 'nonce');
    if (!is_user_logged_in()) {
      wp_send_json_error(array('message' => 'Login required'), 403);
    }
    $blocks = max(0, intval($_POST['blocks'] ?? 0));
    $cap = SSDTF_Rewards_Points::available_redeem_value(get_current_user_id(), WC()->cart ? WC()->cart->get_subtotal() : 0);
    $blocks = min($blocks, $cap['blocks']);
    self::set_session_blocks($blocks);
    self::ensure_coupon_applied();
    wp_send_json_success(array('blocks' => $blocks));
  }

  public static function ajax_remove() {
    check_ajax_referer('ssdtf_points', 'nonce');
    self::set_session_blocks(0);
    self::ensure_coupon_applied();
    wp_send_json_success();
  }

  public static function coupon_label($label, $coupon) {
    if ($coupon && strtolower($coupon->get_code()) === self::COUPON_CODE) {
      return __('Rewards points', 'ssdtf-rewards');
    }
    return $label;
  }

  public static function deduct_for_order(WC_Order $order) {
    $user_id = $order->get_customer_id();
    if ($user_id <= 0) {
      return;
    }
    $blocks = self::session_blocks();
    if ($blocks <= 0) {
      // Recover from applied coupon amount if session lost.
      foreach ($order->get_coupon_codes() as $code) {
        if (strtolower($code) === self::COUPON_CODE) {
          $discount = floatval($order->get_discount_total());
          $block_val = SSDTF_Rewards_Settings::get_float('ssdtf_redeem_value');
          $blocks = $block_val > 0 ? (int) round($discount / $block_val) : 0;
        }
      }
    }
    if ($blocks <= 0) {
      return;
    }
    $points = $blocks * SSDTF_Rewards_Settings::get_int('ssdtf_redeem_points');
    $balance = SSDTF_Rewards_Points::balance($user_id);
    if ($balance < $points) {
      $order->remove_coupon(self::COUPON_CODE);
      throw new Exception(__('Not enough rewards points. The points discount was removed.', 'ssdtf-rewards'));
    }
    SSDTF_Rewards_Points::insert_row(
      $user_id,
      'redeem',
      -abs($points),
      sprintf(__('Redeemed on Order #%s', 'ssdtf-rewards'), $order->get_order_number()),
      $order->get_id()
    );
    $order->update_meta_data('_ssdtf_points_redeemed', $points);
    $order->save();
    self::set_session_blocks(0);
  }

  public static function on_order_processed($order_id, $posted, $order) {
    try {
      if ($order instanceof WC_Order) {
        self::deduct_for_order($order);
      }
    } catch (Exception $e) {
      wc_add_notice($e->getMessage(), 'error');
    }
  }

  public static function on_store_api_order($order) {
    if ($order instanceof WC_Order) {
      try {
        self::deduct_for_order($order);
      } catch (Exception $e) {
        // Store API: remove coupon meta if somehow present.
        SSDTF_Rewards_Logger::log('Store API redeem failed: ' . $e->getMessage(), 'error');
      }
    }
  }

  public static function register_blocks_integration() {
    // Classic + AJAX UI covers most cases; Blocks still honor the virtual coupon via session.
    if (function_exists('woocommerce_store_api_register_endpoint_data')) {
      // Intentionally minimal — session coupon is applied server-side.
    }
  }
}
