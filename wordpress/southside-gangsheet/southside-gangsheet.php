<?php
/**
 * Plugin Name: South Side Gang Sheet Builder
 * Description: Embed the South Side DTF customer gang sheet builder and add finished sheets to the WooCommerce cart.
 * Version: 1.04
 * Author: South Side DTF
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 * Text Domain: southside-gangsheet
 */

if (!defined('ABSPATH')) {
  exit;
}

define('SSGS_PLUGIN_VERSION', '1.04');
define('SSGS_DEFAULT_BUILDER_URL', 'https://southside-dtf.vercel.app');

function ssgs_default_options() {
  return array(
    'builder_url' => SSGS_DEFAULT_BUILDER_URL,
    'default_height' => 2400,
    'min_height' => 900,
    'product_id' => 0,
    'precut_product_id' => 0,
  );
}

function ssgs_get_options() {
  return wp_parse_args(get_option('ssgs_options', array()), ssgs_default_options());
}

add_action('admin_menu', function () {
  add_options_page(
    __('South Side Gang Sheet', 'southside-gangsheet'),
    __('Gang Sheet Builder', 'southside-gangsheet'),
    'manage_options',
    'southside-gangsheet',
    'ssgs_render_settings_page'
  );
});

add_action('admin_init', function () {
  register_setting('ssgs_options_group', 'ssgs_options', array(
    'type' => 'array',
    'sanitize_callback' => 'ssgs_sanitize_options',
    'default' => ssgs_default_options(),
  ));
});

function ssgs_sanitize_options($input) {
  $out = ssgs_default_options();
  if (!is_array($input)) {
    return $out;
  }
  $url = isset($input['builder_url']) ? esc_url_raw(trim($input['builder_url'])) : $out['builder_url'];
  $out['builder_url'] = untrailingslashit($url ?: SSGS_DEFAULT_BUILDER_URL);
  $out['default_height'] = max(600, intval($input['default_height'] ?? $out['default_height']));
  $out['min_height'] = max(400, intval($input['min_height'] ?? $out['min_height']));
  $out['product_id'] = max(0, intval($input['product_id'] ?? 0));
  $out['precut_product_id'] = max(0, intval($input['precut_product_id'] ?? 0));
  return $out;
}

function ssgs_render_settings_page() {
  if (!current_user_can('manage_options')) {
    return;
  }
  $opts = ssgs_get_options();
  ?>
  <div class="wrap">
    <h1><?php esc_html_e('South Side Gang Sheet Builder', 'southside-gangsheet'); ?></h1>
    <p><?php esc_html_e('Embed the customer builder on any page or WooCommerce product with the shortcode below.', 'southside-gangsheet'); ?></p>
    <p><code>[southside_gangsheet]</code></p>
    <form method="post" action="options.php">
      <?php settings_fields('ssgs_options_group'); ?>
      <table class="form-table" role="presentation">
        <tr>
          <th scope="row"><label for="ssgs_builder_url"><?php esc_html_e('Builder URL', 'southside-gangsheet'); ?></label></th>
          <td>
            <input name="ssgs_options[builder_url]" id="ssgs_builder_url" type="url" class="regular-text" value="<?php echo esc_attr($opts['builder_url']); ?>" />
            <p class="description"><?php esc_html_e('Usually https://southside-dtf.vercel.app — no trailing slash.', 'southside-gangsheet'); ?></p>
          </td>
        </tr>
        <tr>
          <th scope="row"><label for="ssgs_product_id"><?php esc_html_e('WooCommerce product ID', 'southside-gangsheet'); ?></label></th>
          <td>
            <input name="ssgs_options[product_id]" id="ssgs_product_id" type="number" min="0" step="1" value="<?php echo esc_attr($opts['product_id']); ?>" />
            <p class="description"><?php esc_html_e('Custom Gang Sheet (Builder) product ID (4365). Leave 0 to auto-detect slug custom-gang-sheet-builder. Sheet height picks the smallest fitting variation.', 'southside-gangsheet'); ?></p>
          </td>
        </tr>
        <tr>
          <th scope="row"><label for="ssgs_precut_product_id"><?php esc_html_e('Pre-cut product ID', 'southside-gangsheet'); ?></label></th>
          <td>
            <input name="ssgs_options[precut_product_id]" id="ssgs_precut_product_id" type="number" min="0" step="1" value="<?php echo esc_attr($opts['precut_product_id']); ?>" />
            <p class="description"><?php esc_html_e("The hidden 'Pre-cut Transfers' product. Leave 0 to disable pre-cut charging.", 'southside-gangsheet'); ?></p>
          </td>
        </tr>
        <tr>
          <th scope="row"><label for="ssgs_default_height"><?php esc_html_e('Default iframe height (px)', 'southside-gangsheet'); ?></label></th>
          <td>
            <input name="ssgs_options[default_height]" id="ssgs_default_height" type="number" min="600" step="50" value="<?php echo esc_attr($opts['default_height']); ?>" />
          </td>
        </tr>
        <tr>
          <th scope="row"><label for="ssgs_min_height"><?php esc_html_e('Minimum iframe height (px)', 'southside-gangsheet'); ?></label></th>
          <td>
            <input name="ssgs_options[min_height]" id="ssgs_min_height" type="number" min="400" step="50" value="<?php echo esc_attr($opts['min_height']); ?>" />
          </td>
        </tr>
      </table>
      <?php submit_button(); ?>
    </form>
  </div>
  <?php
}

add_shortcode('southside_gangsheet', 'ssgs_render_shortcode');

function ssgs_render_shortcode($atts) {
  $opts = ssgs_get_options();
  $atts = shortcode_atts(array(
    'height' => $opts['default_height'],
    'title' => __('Build a Gang Sheet', 'southside-gangsheet'),
    'url' => '',
  ), $atts, 'southside_gangsheet');

  $base = untrailingslashit($atts['url'] ?: $opts['builder_url']);
  $src = $base . '/embed';
  $height = max(intval($opts['min_height']), intval($atts['height']));
  $id = 'ssgs-frame-' . uniqid();

  wp_enqueue_script(
    'southside-gangsheet-embed',
    plugins_url('embed.js', __FILE__),
    array(),
    SSGS_PLUGIN_VERSION,
    true
  );
  wp_localize_script('southside-gangsheet-embed', 'ssgsEmbed', array(
    'minHeight' => intval($opts['min_height']),
    'builderOrigin' => $base,
    'ajaxUrl' => admin_url('admin-ajax.php'),
    'nonce' => wp_create_nonce('ssgs_add_to_cart'),
  ));

  ob_start();
  ?>
  <div class="ssgs-embed-wrap" data-ssgs-embed="1">
    <iframe
      id="<?php echo esc_attr($id); ?>"
      class="ssgs-embed-frame"
      src="<?php echo esc_url($src); ?>"
      title="<?php echo esc_attr($atts['title']); ?>"
      loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"
      allow="clipboard-write"
      style="width:100%;max-width:100%;height:<?php echo esc_attr($height); ?>px;border:0;border-radius:12px;background:#f4f8fb;"
    ></iframe>
    <p class="ssgs-embed-fallback">
      <a href="<?php echo esc_url($base . '/'); ?>" target="_blank" rel="noopener noreferrer">
        <?php esc_html_e('Open the gang sheet builder in a new tab', 'southside-gangsheet'); ?>
      </a>
    </p>
  </div>
  <?php
  return ob_get_clean();
}

add_action('wp_enqueue_scripts', function () {
  if (!is_singular()) {
    return;
  }
  $post = get_post();
  if (!$post || !has_shortcode($post->post_content, 'southside_gangsheet')) {
    return;
  }
  wp_register_script(
    'southside-gangsheet-embed',
    plugins_url('embed.js', __FILE__),
    array(),
    SSGS_PLUGIN_VERSION,
    true
  );
});

/**
 * Smallest variation whose roll length fits the sheet (>= target).
 * Falls back to the largest only when the sheet exceeds every size.
 */
function ssgs_find_variation_id($product, $sheet_height_in) {
  if (!$product || !$product->is_type('variable')) {
    return 0;
  }

  $target = floatval($sheet_height_in);
  if ($target <= 0) {
    return 0;
  }

  $sizes = array();
  foreach ($product->get_children() as $variation_id) {
    $variation = wc_get_product($variation_id);
    if (!$variation || !$variation->exists() || !$variation->is_purchasable()) {
      continue;
    }

    $label = implode(' ', $variation->get_attributes());

    // "22in x 36in" -> 36 (the second number is the roll length, not the 22in width).
    if (preg_match('/x\s*([0-9]+(?:\.[0-9]+)?)/i', $label, $match)) {
      $length = floatval($match[1]);
    } elseif (preg_match('/([0-9]+(?:\.[0-9]+)?)/', $label, $match)) {
      $length = floatval($match[1]);
    } else {
      continue;
    }

    if ($length <= 0) {
      continue;
    }

    $sizes[] = array('id' => intval($variation_id), 'length' => $length);
  }

  if (empty($sizes)) {
    return 0;
  }

  usort($sizes, function ($a, $b) {
    return $a['length'] <=> $b['length'];
  });

  foreach ($sizes as $size) {
    if ($size['length'] + 0.01 >= $target) {
      return $size['id'];
    }
  }

  $largest = end($sizes);
  return $largest['id'];
}

/**
 * Resolve the Custom Gang Sheet (Builder) product from settings or its slug.
 */
function ssgs_resolve_product_id() {
  $opts = ssgs_get_options();
  $product_id = intval($opts['product_id']);
  if ($product_id > 0) {
    return $product_id;
  }
  foreach (array('custom-gang-sheet-builder') as $slug) {
    $post = get_page_by_path($slug, OBJECT, 'product');
    if ($post && !empty($post->ID)) {
      return intval($post->ID);
    }
  }
  return 0;
}

function ssgs_handle_add_to_cart() {
  if (!check_ajax_referer('ssgs_add_to_cart', 'nonce', false)) {
    wp_send_json_error(array('message' => 'Invalid cart request.'), 403);
  }
  if (!class_exists('WooCommerce')) {
    wp_send_json_error(array('message' => 'WooCommerce is not active.'), 500);
  }
  if (is_null(WC()->cart)) {
    wc_load_cart();
  }

  $product_id = ssgs_resolve_product_id();
  if ($product_id <= 0) {
    wp_send_json_error(array('message' => 'Set the WooCommerce product ID in Gang Sheet Builder settings (Build A Gangsheet).'), 400);
  }

  $payload_raw = isset($_POST['payload']) ? wp_unslash($_POST['payload']) : '';
  $payload = json_decode($payload_raw, true);
  if (!is_array($payload)) {
    wp_send_json_error(array('message' => 'Missing gang sheet cart payload.'), 400);
  }

  $file_base64 = isset($_POST['fileBase64']) ? preg_replace('/\\s+/', '', (string) wp_unslash($_POST['fileBase64'])) : '';
  $file_name = sanitize_file_name(isset($_POST['fileName']) ? (string) wp_unslash($_POST['fileName']) : 'gangsheet.png');
  if ($file_base64 === '') {
    wp_send_json_error(array('message' => 'Missing gang sheet file.'), 400);
  }

  $binary = base64_decode($file_base64, true);
  if ($binary === false || strlen($binary) < 32) {
    wp_send_json_error(array('message' => 'Gang sheet file was unreadable.'), 400);
  }

  $upload = wp_upload_bits($file_name, null, $binary);
  if (!empty($upload['error'])) {
    wp_send_json_error(array('message' => $upload['error']), 500);
  }

  $product = wc_get_product($product_id);
  if (!$product) {
    wp_send_json_error(array('message' => 'Gang sheet product not found.'), 404);
  }

  $printed_height = floatval($payload['sheetHeightIn'] ?? 0);
  $billable_height = floatval($payload['billableHeightIn'] ?? 0);

  if ($printed_height <= 0) {
    wp_send_json_error(array('message' => 'The builder did not send a sheet length.'), 400);
  }

  // Never bill for more than we print, and never bill on a missing figure.
  if ($billable_height <= 0 || $billable_height > $printed_height) {
    $billable_height = $printed_height;
  }

  $variation_id = 0;
  $variation = array();
  if ($product->is_type('variable')) {
    $variation_id = ssgs_find_variation_id($product, $billable_height);
    if ($variation_id <= 0) {
      wp_send_json_error(array('message' => 'No matching sheet length variation for this gang sheet.'), 400);
    }
    $variation = wc_get_product_variation_attributes($variation_id);
  }

  $quantity = max(1, intval($payload['quantity'] ?? 1));
  $cart_item_data = array(
    'ssgs_customer_name' => sanitize_text_field($payload['customerName'] ?? ''),
    'ssgs_sheet_index' => sanitize_text_field($payload['sheetIndex'] ?? ''),
    'ssgs_designs' => intval($payload['designs'] ?? 0),
    'ssgs_transfers' => intval($payload['transfers'] ?? 0),
    'ssgs_precut' => !empty($payload['precut']) ? 'yes' : 'no',
    'ssgs_precut_total' => floatval($payload['precutTotal'] ?? 0),
    'ssgs_printed_height' => $printed_height,
    'ssgs_billed_height' => $billable_height,
    'ssgs_file_url' => esc_url_raw($payload['fileUrl'] ?? $upload['url']),
    'ssgs_local_file' => esc_url_raw($upload['url']),
    'unique_key' => md5($upload['url'] . microtime()),
  );

  $added = WC()->cart->add_to_cart($product_id, $quantity, $variation_id, $variation, $cart_item_data);
  if (!$added) {
    wp_send_json_error(array('message' => 'WooCommerce could not add this sheet to the cart.'), 500);
  }

  $precut_total = floatval($payload['precutTotal'] ?? 0);
  $precut_id = intval(ssgs_get_options()['precut_product_id']);

  if (!empty($payload['precut']) && $precut_total > 0 && $precut_id > 0 && $added) {
    WC()->cart->add_to_cart($precut_id, $quantity, 0, array(), array(
      'ssgs_precut_amount' => $precut_total,
      'ssgs_precut_for' => $cart_item_data['unique_key'],
      'ssgs_precut_sheet' => sanitize_text_field($payload['sheetIndex'] ?? ''),
      'ssgs_transfers' => intval($payload['transfers'] ?? 0),
      'unique_key' => md5('precut' . $cart_item_data['unique_key']),
    ));
  }

  wp_send_json_success(array(
    'cartUrl' => wc_get_cart_url(),
    'fileUrl' => $upload['url'],
  ));
}

add_action('wp_ajax_ssgs_add_to_cart', 'ssgs_handle_add_to_cart');
add_action('wp_ajax_nopriv_ssgs_add_to_cart', 'ssgs_handle_add_to_cart');

add_action('woocommerce_before_calculate_totals', function ($cart) {
  if (is_admin() && !defined('DOING_AJAX')) {
    return;
  }
  if (!$cart instanceof WC_Cart) {
    return;
  }

  foreach ($cart->get_cart() as $cart_item) {
    if (empty($cart_item['ssgs_precut_amount']) || empty($cart_item['data'])) {
      continue;
    }
    $cart_item['data']->set_price(floatval($cart_item['ssgs_precut_amount']));
  }
}, 20, 1);

// Remove the pre-cut line when its sheet is removed.
add_action('woocommerce_cart_item_removed', function ($removed_key, $cart) {
  $removed = isset($cart->removed_cart_contents[$removed_key]) ? $cart->removed_cart_contents[$removed_key] : null;
  if (!$removed || empty($removed['unique_key'])) {
    return;
  }
  foreach ($cart->get_cart() as $key => $item) {
    if (!empty($item['ssgs_precut_for']) && $item['ssgs_precut_for'] === $removed['unique_key']) {
      $cart->remove_cart_item($key);
    }
  }
}, 10, 2);

// Keep quantities matched.
add_action('woocommerce_after_cart_item_quantity_update', function ($key, $quantity, $old, $cart) {
  $item = isset($cart->cart_contents[$key]) ? $cart->cart_contents[$key] : null;
  if (!$item || empty($item['unique_key'])) {
    return;
  }
  foreach ($cart->get_cart() as $other_key => $other) {
    if (!empty($other['ssgs_precut_for']) && $other['ssgs_precut_for'] === $item['unique_key']) {
      $cart->set_quantity($other_key, $quantity, false);
    }
  }
}, 10, 4);

// The pre-cut line is driven by its sheet - customers can't edit it directly.
add_filter('woocommerce_cart_item_quantity', function ($html, $key, $item) {
  if (!empty($item['ssgs_precut_for'])) {
    return sprintf('<span>%d</span>', intval($item['quantity']));
  }
  return $html;
}, 10, 3);

add_filter('woocommerce_get_item_data', function ($item_data, $cart_item) {
  $map = array(
    'ssgs_customer_name' => __('Customer', 'southside-gangsheet'),
    'ssgs_sheet_index' => __('Sheet', 'southside-gangsheet'),
    'ssgs_designs' => __('Designs', 'southside-gangsheet'),
    'ssgs_transfers' => __('Transfers', 'southside-gangsheet'),
    'ssgs_precut' => __('Pre-cut', 'southside-gangsheet'),
  );
  foreach ($map as $key => $label) {
    if (!empty($cart_item[$key]) && empty($cart_item['ssgs_precut_for'])) {
      $item_data[] = array(
        'key' => $label,
        'value' => esc_html((string) $cart_item[$key]),
      );
    }
  }

  if (!empty($cart_item['ssgs_printed_height']) && !empty($cart_item['ssgs_billed_height'])
      && floatval($cart_item['ssgs_printed_height']) > floatval($cart_item['ssgs_billed_height'])) {
    $item_data[] = array(
      'key' => __('Printed length', 'southside-gangsheet'),
      'value' => sprintf(
        __('%s in (pre-cut spacing)', 'southside-gangsheet'),
        rtrim(rtrim(number_format(floatval($cart_item['ssgs_printed_height']), 2, '.', ''), '0'), '.')
      ),
    );
  }

  if (!empty($cart_item['ssgs_precut_for'])) {
    if (!empty($cart_item['ssgs_transfers'])) {
      $item_data[] = array('key' => __('Transfers', 'southside-gangsheet'), 'value' => intval($cart_item['ssgs_transfers']));
    }
    if (!empty($cart_item['ssgs_precut_sheet'])) {
      $item_data[] = array('key' => __('For sheet', 'southside-gangsheet'), 'value' => esc_html($cart_item['ssgs_precut_sheet']));
    }
  }

  if (!empty($cart_item['ssgs_file_url'])) {
    $item_data[] = array(
      'key' => __('File', 'southside-gangsheet'),
      'value' => esc_url($cart_item['ssgs_file_url']),
    );
  }
  return $item_data;
}, 10, 2);

add_action('woocommerce_checkout_create_order_line_item', function ($item, $cart_item_key, $values) {
  foreach (array(
    'ssgs_customer_name',
    'ssgs_sheet_index',
    'ssgs_designs',
    'ssgs_transfers',
    'ssgs_precut',
    'ssgs_precut_total',
    'ssgs_printed_height',
    'ssgs_billed_height',
    'ssgs_precut_amount',
    'ssgs_precut_for',
    'ssgs_precut_sheet',
    'ssgs_file_url',
    'ssgs_local_file',
  ) as $key) {
    if (isset($values[$key])) {
      $item->add_meta_data($key, $values[$key], true);
    }
  }
}, 10, 3);
