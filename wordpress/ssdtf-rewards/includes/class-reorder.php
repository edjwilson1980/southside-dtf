<?php
if (!defined('ABSPATH')) {
  exit;
}

class SSDTF_Rewards_Reorder {
  public static function init() {
    add_action('rest_api_init', array(__CLASS__, 'register_routes'));
    add_action('woocommerce_order_details_after_order_table', array(__CLASS__, 'render_order_items'), 15, 1);
    add_filter('woocommerce_my_account_my_orders_columns', array(__CLASS__, 'orders_columns'));
    add_action('woocommerce_my_account_my_orders_column_ssdtf-reorder', array(__CLASS__, 'orders_column_content'));
    add_action('wp_enqueue_scripts', array(__CLASS__, 'assets'));
  }

  public static function assets() {
    if (!is_account_page()) {
      return;
    }
    wp_register_script('ssdtf-rewards-reorder', false, array(), SSDTF_REWARDS_VERSION, true);
    wp_enqueue_script('ssdtf-rewards-reorder');
    wp_add_inline_script(
      'ssdtf-rewards-reorder',
      'window.ssdtfReorder=' . wp_json_encode(array(
        'root' => esc_url_raw(rest_url('ssdtf/v1/reorder')),
        'nonce' => wp_create_nonce('wp_rest'),
      )) . ';'
      . 'document.addEventListener("click",function(e){var b=e.target.closest("[data-ssdtf-reorder]");if(!b)return;e.preventDefault();b.disabled=true;fetch(window.ssdtfReorder.root,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-WP-Nonce":window.ssdtfReorder.nonce},body:JSON.stringify({order_id:Number(b.getAttribute("data-order")),item_id:Number(b.getAttribute("data-item")||0),all:b.getAttribute("data-all")==="1"})}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});}).then(function(res){if(res.ok&&res.j&&res.j.cart_url){window.location=res.j.cart_url;}else{alert((res.j&&(res.j.message||res.j.code))||"Reorder failed");b.disabled=false;}}).catch(function(){alert("Reorder failed");b.disabled=false;});});'
    );
  }

  public static function register_routes() {
    register_rest_route('ssdtf/v1', '/reorder', array(
      'methods' => 'POST',
      'permission_callback' => function () {
        return is_user_logged_in();
      },
      'callback' => array(__CLASS__, 'rest_reorder'),
    ));
  }

  public static function rest_reorder(WP_REST_Request $req) {
    $user_id = get_current_user_id();
    $order_id = intval($req['order_id'] ?? 0);
    $item_id = intval($req['item_id'] ?? 0);
    $all = !empty($req['all']);
    $order = wc_get_order($order_id);
    if (!$order || intval($order->get_customer_id()) !== $user_id) {
      return new WP_Error('ssdtf_forbidden', __('You cannot reorder this order.', 'ssdtf-rewards'), array('status' => 403));
    }
    if (is_null(WC()->cart)) {
      wc_load_cart();
    }

    $added = 0;
    foreach ($order->get_items() as $id => $item) {
      if (!$all && intval($id) !== $item_id) {
        continue;
      }
      if (!$item instanceof WC_Order_Item_Product) {
        continue;
      }
      $result = self::add_item_to_cart($order, $item, $user_id);
      if (is_wp_error($result)) {
        if (!$all) {
          return $result;
        }
        continue;
      }
      if ($result) {
        $added++;
      }
    }
    if ($added <= 0) {
      return new WP_Error('ssdtf_reorder', __('Nothing could be reordered.', 'ssdtf-rewards'), array('status' => 400));
    }
    wc_add_notice(__('Added your gang sheet to the cart.', 'ssdtf-rewards'), 'success');
    return rest_ensure_response(array(
      'ok' => true,
      'added' => $added,
      'cart_url' => wc_get_cart_url(),
    ));
  }

  public static function line_drive_id(WC_Order_Item_Product $item) {
    $id = (string) $item->get_meta('_ssdtf_drive_file_id', true);
    if ($id === '') {
      $id = (string) $item->get_meta('ssgs_drive_file_id', true);
    }
    return $id;
  }

  public static function line_length(WC_Order_Item_Product $item) {
    $len = floatval($item->get_meta('_ssdtf_length_in', true));
    if ($len <= 0) {
      $len = floatval($item->get_meta('ssgs_billed_height', true));
    }
    if ($len <= 0) {
      $len = floatval($item->get_meta('ssgs_printed_height', true));
    }
    return $len;
  }

  public static function can_reorder_item(WC_Order_Item_Product $item, $user_id) {
    $product_id = $item->get_product_id();
    if ($product_id === 2223) {
      return false;
    }
    if (!in_array($product_id, SSDTF_Rewards_Settings::reorder_product_ids(), true)) {
      return false;
    }
    $drive = self::line_drive_id($item);
    if ($drive === '') {
      return false;
    }
    return SSDTF_Rewards_Files::is_reorderable_for_user($drive, $user_id);
  }

  public static function expired_label(WC_Order_Item_Product $item, $user_id) {
    $drive = self::line_drive_id($item);
    if ($drive === '') {
      return '';
    }
    $row = SSDTF_Rewards_Files::get($drive);
    if ($row && intval($row['user_id']) === intval($user_id) && in_array($row['status'], array('archived', 'deleted'), true)) {
      return __('File expired', 'ssdtf-rewards');
    }
    return '';
  }

  public static function add_item_to_cart(WC_Order $order, WC_Order_Item_Product $item, $user_id) {
    if (!self::can_reorder_item($item, $user_id)) {
      return new WP_Error('ssdtf_expired', __('This file is not available to reorder.', 'ssdtf-rewards'), array('status' => 400));
    }
    $drive = self::line_drive_id($item);
    $row = SSDTF_Rewards_Files::get($drive);
    $product_id = $item->get_product_id();
    $length = floatval($row['length_in'] ?: self::line_length($item));
    $width = floatval($row['width_in'] ?: 22);
    $filename = $row['filename'] ?: (string) $item->get_meta('File', true);
    $qty = max(1, intval($item->get_quantity()));
    $variation_id = 0;
    $variation = array();

    $product = wc_get_product($product_id);
    if (!$product) {
      return new WP_Error('ssdtf_product', __('Product not found.', 'ssdtf-rewards'), array('status' => 404));
    }

    // Upload product 115: recompute variation from length (current prices).
    $upload_id = function_exists('ssdtf_upload_product_id') ? ssdtf_upload_product_id() : 115;
    if ($product_id === $upload_id && function_exists('ssdtf_pick_upload_size')) {
      $picked = ssdtf_pick_upload_size($length);
      if (!$picked) {
        return new WP_Error('ssdtf_size', __('No matching sheet size.', 'ssdtf-rewards'), array('status' => 400));
      }
      $variation_id = intval($picked['variation_id']);
      $variation = wc_get_product_variation_attributes($variation_id);
    } elseif ($product->is_type('variable') && function_exists('ssgs_find_variation_id')) {
      $variation_id = ssgs_find_variation_id($product, $length);
      if ($variation_id <= 0) {
        return new WP_Error('ssdtf_size', __('No matching sheet size.', 'ssdtf-rewards'), array('status' => 400));
      }
      $variation = wc_get_product_variation_attributes($variation_id);
    } elseif ($item->get_variation_id()) {
      // Fall back to original variation id (price will be current).
      $variation_id = $item->get_variation_id();
      $variation = wc_get_product_variation_attributes($variation_id);
    }

    $file_url = 'https://drive.google.com/file/d/' . rawurlencode($drive) . '/view';
    $cart_item_data = array(
      'ssgs_customer_name' => $order->get_billing_first_name() . ' ' . $order->get_billing_last_name(),
      'ssgs_sheet_type' => ($product_id === $upload_id) ? 'uploaded' : 'built',
      'ssgs_printed_height' => $length,
      'ssgs_billed_height' => $length,
      'ssgs_drive_file_id' => $drive,
      'ssgs_file_url' => $file_url,
      'ssgs_print_file_name' => $filename,
      'ssdtf_drive_file_id' => $drive,
      'ssdtf_filename' => $filename,
      'ssdtf_width_in' => $width,
      'ssdtf_length_in' => $length,
      'ssdtf_dpi' => floatval($item->get_meta('ssgs_effective_dpi', true) ?: 300),
      'ssdtf_is_reorder' => 1,
      'unique_key' => md5($drive . '|reorder|' . microtime(true)),
    );

    $key = WC()->cart->add_to_cart($product_id, $qty, $variation_id, $variation, $cart_item_data);
    if (!$key) {
      return new WP_Error('ssdtf_cart', __('Could not add to cart.', 'ssdtf-rewards'), array('status' => 500));
    }
    return true;
  }

  public static function orders_columns($columns) {
    $new = array();
    foreach ($columns as $key => $label) {
      $new[$key] = $label;
      if ($key === 'order-number') {
        $new['ssdtf-reorder'] = __('Gang sheet', 'ssdtf-rewards');
      }
    }
    return $new;
  }

  public static function orders_column_content($order) {
    if (!$order instanceof WC_Order) {
      return;
    }
    $user_id = get_current_user_id();
    $shown = false;
    foreach ($order->get_items() as $item_id => $item) {
      if (!$item instanceof WC_Order_Item_Product) {
        continue;
      }
      $drive = self::line_drive_id($item);
      if ($drive === '') {
        continue;
      }
      $row = SSDTF_Rewards_Files::get($drive);
      if ($row && $row['status'] === 'active' && intval($row['user_id']) === $user_id) {
        $url = SSDTF_Rewards_Relay::thumb_url($drive, $user_id);
        if ($url) {
          echo '<img src="' . esc_url($url) . '" alt="" width="48" height="48" style="object-fit:contain;background:#f3f3f3;border-radius:4px;" /> ';
        }
        printf(
          '<button type="button" class="button" data-ssdtf-reorder data-order="%d" data-item="%d">%s</button>',
          $order->get_id(),
          $item_id,
          esc_html__('Reorder', 'ssdtf-rewards')
        );
        $shown = true;
        break;
      }
      if ($row && in_array($row['status'], array('archived', 'deleted'), true)) {
        echo '<span class="ssdtf-expired">' . esc_html__('File expired', 'ssdtf-rewards') . '</span>';
        $shown = true;
        break;
      }
    }
    if (!$shown) {
      echo '&mdash;';
    }
  }

  public static function render_order_items($order) {
    if (!$order instanceof WC_Order || intval($order->get_customer_id()) !== get_current_user_id()) {
      return;
    }
    $user_id = get_current_user_id();
    $any = false;
    echo '<section class="ssdtf-reorder-panel"><h2>' . esc_html__('Gang sheets', 'ssdtf-rewards') . '</h2>';
    echo '<ul style="list-style:none;padding:0;margin:0;">';
    foreach ($order->get_items() as $item_id => $item) {
      if (!$item instanceof WC_Order_Item_Product) {
        continue;
      }
      $drive = self::line_drive_id($item);
      if ($drive === '') {
        continue;
      }
      $any = true;
      $row = SSDTF_Rewards_Files::get($drive);
      $filename = $row['filename'] ?? (string) $item->get_meta('File', true);
      $length = $row['length_in'] ?? self::line_length($item);
      echo '<li style="display:flex;gap:16px;align-items:flex-start;margin:16px 0;padding:12px 0;border-bottom:1px solid #eee;">';
      if ($row && $row['status'] === 'active') {
        $url = SSDTF_Rewards_Relay::thumb_url($drive, $user_id);
        if ($url) {
          echo '<img src="' . esc_url($url) . '" alt="" width="160" height="160" style="object-fit:contain;background:#f3f3f3;" />';
        }
      } else {
        echo '<div style="width:160px;height:160px;background:#ddd;color:#666;display:flex;align-items:center;justify-content:center;">' . esc_html__('Expired', 'ssdtf-rewards') . '</div>';
      }
      echo '<div>';
      echo '<strong>' . esc_html($filename) . '</strong><br />';
      printf(esc_html__('Measured size: %s in', 'ssdtf-rewards'), esc_html(rtrim(rtrim(number_format(floatval($length), 2, '.', ''), '0'), '.')));
      echo '<br />';
      if ($row && $row['status'] === 'active' && intval($row['user_id']) === $user_id) {
        $until = get_date_from_gmt($row['expires_at'], get_option('date_format'));
        printf('<p>%s</p>', esc_html(sprintf(__('Reorder available until %s', 'ssdtf-rewards'), $until)));
        printf(
          '<button type="button" class="button" data-ssdtf-reorder data-order="%d" data-item="%d">%s</button>',
          $order->get_id(),
          $item_id,
          esc_html__('Reorder', 'ssdtf-rewards')
        );
      } else {
        echo '<p>' . esc_html__('File expired', 'ssdtf-rewards') . '</p>';
      }
      echo '</div></li>';
    }
    echo '</ul>';
    if ($any) {
      $reorderable = false;
      foreach ($order->get_items() as $item) {
        if ($item instanceof WC_Order_Item_Product && self::can_reorder_item($item, $user_id)) {
          $reorderable = true;
          break;
        }
      }
      if ($reorderable) {
        printf(
          '<p><button type="button" class="button button-primary" data-ssdtf-reorder data-all="1" data-order="%d">%s</button></p>',
          $order->get_id(),
          esc_html__('Reorder all', 'ssdtf-rewards')
        );
      }
    }
    echo '</section>';
  }
}
