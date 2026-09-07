<?php
/**
 * Plugin Name: South Side Gang Sheet Builder
 * Description: Embed the South Side DTF customer gang sheet builder and add finished sheets to the WooCommerce cart.
 * Version: 1.02
 * Author: South Side DTF
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 * Text Domain: southside-gangsheet
 */

if (!defined('ABSPATH')) {
  exit;
}

define('SSGS_PLUGIN_VERSION', '1.02');
define('SSGS_DEFAULT_BUILDER_URL', 'https://southside-dtf.vercel.app');

function ssgs_default_options() {
  return array(
    'builder_url' => SSGS_DEFAULT_BUILDER_URL,
    'default_height' => 2400,
    'min_height' => 900,
    'product_id' => 0,
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
            <p class="description"><?php esc_html_e('The “Build A Gangsheet” variable product. Leave 0 to auto-detect slug build-a-gangsheet. Sheet height picks the matching variation.', 'southside-gangsheet'); ?></p>
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
 * Match a variation by sheet height (inches). Prefers attribute values that contain the height.
 */
function ssgs_find_variation_id($product, $sheet_height_in) {
  if (!$product || !$product->is_type('variable')) {
    return 0;
  }
  $target = intval(round(floatval($sheet_height_in)));
  $best_id = 0;
  $best_delta = PHP_INT_MAX;

  foreach ($product->get_children() as $variation_id) {
    $variation = wc_get_product($variation_id);
    if (!$variation || !$variation->exists()) {
      continue;
    }
    $label = implode(' ', $variation->get_attributes());
    if (preg_match('/(\\d+)\\s*(?:in|")?/i', $label, $match)) {
      // Prefer the length number when label looks like "22in x 12in"
      if (preg_match('/x\\s*(\\d+)/i', $label, $length_match)) {
        $height = intval($length_match[1]);
      } else {
        $height = intval($match[1]);
      }
      $delta = abs($height - $target);
      if ($delta < $best_delta) {
        $best_delta = $delta;
        $best_id = $variation_id;
      }
    }
  }

  return $best_id;
}

/**
 * Resolve the Build A Gangsheet product from settings or common slugs.
 */
function ssgs_resolve_product_id() {
  $opts = ssgs_get_options();
  $product_id = intval($opts['product_id']);
  if ($product_id > 0) {
    return $product_id;
  }
  foreach (array('build-a-gangsheet', 'build-a-gang-sheet', 'upload-gangsheet') as $slug) {
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

  $variation_id = 0;
  $variation = array();
  if ($product->is_type('variable')) {
    $variation_id = ssgs_find_variation_id($product, $payload['sheetHeightIn'] ?? 0);
    if ($variation_id <= 0) {
      wp_send_json_error(array('message' => 'No matching sheet length variation for this gang sheet.'), 400);
    }
    $variation_product = wc_get_product($variation_id);
    $variation = $variation_product ? $variation_product->get_attributes() : array();
  }

  $quantity = max(1, intval($payload['quantity'] ?? 1));
  $cart_item_data = array(
    'ssgs_customer_name' => sanitize_text_field($payload['customerName'] ?? ''),
    'ssgs_sheet_index' => sanitize_text_field($payload['sheetIndex'] ?? ''),
    'ssgs_designs' => intval($payload['designs'] ?? 0),
    'ssgs_transfers' => intval($payload['transfers'] ?? 0),
    'ssgs_precut' => !empty($payload['precut']) ? 'yes' : 'no',
    'ssgs_precut_total' => floatval($payload['precutTotal'] ?? 0),
    'ssgs_file_url' => esc_url_raw($payload['fileUrl'] ?? $upload['url']),
    'ssgs_local_file' => esc_url_raw($upload['url']),
    'unique_key' => md5($upload['url'] . microtime()),
  );

  $added = WC()->cart->add_to_cart($product_id, $quantity, $variation_id, $variation, $cart_item_data);
  if (!$added) {
    wp_send_json_error(array('message' => 'WooCommerce could not add this sheet to the cart.'), 500);
  }

  // Optional pre-cut fee as a fee line
  $precut_total = floatval($payload['precutTotal'] ?? 0);
  if (!empty($payload['precut']) && $precut_total > 0) {
    WC()->cart->add_fee(
      sprintf(__('Pre-cut DTFs (%s)', 'southside-gangsheet'), sanitize_text_field($payload['customerName'] ?? '')),
      $precut_total,
      true
    );
  }

  wp_send_json_success(array(
    'cartUrl' => wc_get_cart_url(),
    'fileUrl' => $upload['url'],
  ));
}

add_action('wp_ajax_ssgs_add_to_cart', 'ssgs_handle_add_to_cart');
add_action('wp_ajax_nopriv_ssgs_add_to_cart', 'ssgs_handle_add_to_cart');

add_filter('woocommerce_get_item_data', function ($item_data, $cart_item) {
  $map = array(
    'ssgs_customer_name' => __('Customer', 'southside-gangsheet'),
    'ssgs_sheet_index' => __('Sheet', 'southside-gangsheet'),
    'ssgs_designs' => __('Designs', 'southside-gangsheet'),
    'ssgs_transfers' => __('Transfers', 'southside-gangsheet'),
    'ssgs_precut' => __('Pre-cut', 'southside-gangsheet'),
  );
  foreach ($map as $key => $label) {
    if (!empty($cart_item[$key])) {
      $item_data[] = array(
        'key' => $label,
        'value' => esc_html((string) $cart_item[$key]),
      );
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
  foreach (array('ssgs_customer_name', 'ssgs_sheet_index', 'ssgs_designs', 'ssgs_transfers', 'ssgs_precut', 'ssgs_precut_total', 'ssgs_file_url', 'ssgs_local_file') as $key) {
    if (isset($values[$key])) {
      $item->add_meta_data($key, $values[$key], true);
    }
  }
}, 10, 3);
