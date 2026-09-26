<?php
/**
 * Upload Gangsheet ↔ WooCommerce size map, REST, and signed cart checks.
 */

if (!defined('ABSPATH')) {
  exit;
}

define('SSDTF_UPLOAD_PRODUCT_ID', 115);
define('SSDTF_WIDTH_TOLERANCE_IN', 0.1);
define('SSDTF_LENGTH_TOLERANCE_IN', 0);
define('SSDTF_UPLOAD_SIZES_TRANSIENT', 'ssdtf_upload_size_map_v1');

/**
 * Pull length (inches) from a pa_select-gang-sheet-size slug.
 * Slugs are inconsistent; take the number after an `x`.
 */
function ssdtf_length_from_slug($slug) {
  if (!is_string($slug) || $slug === '') {
    return 0;
  }
  if (preg_match('/x-?(\d+)/i', $slug, $m)) {
    return intval($m[1]);
  }
  return 0;
}

function ssdtf_upload_product_id() {
  $opts = ssgs_get_options();
  $id = intval($opts['upload_product_id'] ?? 0);
  return $id > 0 ? $id : SSDTF_UPLOAD_PRODUCT_ID;
}

/**
 * Build length ↔ variation map from WooCommerce. Prices come from the product.
 *
 * @return array<int, array{variation_id:int,slug:string,label:string,length_in:int,price:float,price_html:string}>
 */
function ssdtf_upload_size_map() {
  $cached = get_transient(SSDTF_UPLOAD_SIZES_TRANSIENT);
  if (is_array($cached)) {
    return $cached;
  }

  $product = wc_get_product(ssdtf_upload_product_id());
  $map = array();
  if (!$product || !$product->is_type('variable')) {
    set_transient(SSDTF_UPLOAD_SIZES_TRANSIENT, $map, HOUR_IN_SECONDS);
    return $map;
  }

  foreach ($product->get_children() as $vid) {
    $v = wc_get_product($vid);
    if (!$v || !$v->is_purchasable() || !$v->is_in_stock()) {
      continue;
    }
    $attrs = $v->get_attributes();
    $slug = '';
    if (isset($attrs['pa_select-gang-sheet-size'])) {
      $slug = (string) $attrs['pa_select-gang-sheet-size'];
    } elseif (is_array($attrs)) {
      $slug = (string) reset($attrs);
    }
    $len = ssdtf_length_from_slug($slug);
    if (!$len) {
      continue;
    }
    $term = get_term_by('slug', $slug, 'pa_select-gang-sheet-size');
    $label = ($term && !is_wp_error($term)) ? $term->name : $slug;
    $map[] = array(
      'variation_id' => intval($vid),
      'slug' => $slug,
      'label' => $label,
      'length_in' => $len,
      'price' => floatval($v->get_price()),
      'price_html' => wp_strip_all_tags($v->get_price_html()),
    );
  }

  usort($map, function ($a, $b) {
    return $a['length_in'] <=> $b['length_in'];
  });

  set_transient(SSDTF_UPLOAD_SIZES_TRANSIENT, $map, HOUR_IN_SECONDS);
  return $map;
}

function ssdtf_bust_upload_size_map($product_id) {
  $product_id = intval($product_id);
  $upload_id = ssdtf_upload_product_id();
  if ($product_id === $upload_id) {
    delete_transient(SSDTF_UPLOAD_SIZES_TRANSIENT);
    return;
  }
  $product = wc_get_product($product_id);
  if ($product && $product->get_parent_id() === $upload_id) {
    delete_transient(SSDTF_UPLOAD_SIZES_TRANSIENT);
  }
}

add_action('woocommerce_update_product', 'ssdtf_bust_upload_size_map');
add_action('woocommerce_update_product_variation', 'ssdtf_bust_upload_size_map');

/**
 * Smallest variation whose length ≥ measured length (round up).
 */
function ssdtf_pick_upload_size($length_in) {
  $length = floatval($length_in) - SSDTF_LENGTH_TOLERANCE_IN;
  if ($length <= 0) {
    return null;
  }
  if ($length < 12) {
    $length = 12;
  }
  if ($length > 200 + 1e-9) {
    return null;
  }
  foreach (ssdtf_upload_size_map() as $row) {
    if (floatval($row['length_in']) + 1e-9 >= $length) {
      return $row;
    }
  }
  return null;
}

add_action('rest_api_init', function () {
  register_rest_route('ssdtf/v1', '/upload-sizes', array(
    'methods' => 'GET',
    'permission_callback' => '__return_true',
    'callback' => function () {
      if (!class_exists('WooCommerce')) {
        return new WP_Error('ssdtf_no_woo', 'WooCommerce is not active.', array('status' => 503));
      }
      return rest_ensure_response(array(
        'product_id' => ssdtf_upload_product_id(),
        'sizes' => ssdtf_upload_size_map(),
      ));
    },
  ));
});


/**
 * Verify HMAC from the Vercel measure/sign relay.
 * Signs the literal pipe-joined transport string (same as lib/upload-sign.ts).
 */
function ssdtf_verify_upload_sig($fields) {
  $opts = ssgs_get_options();
  $secret = trim((string) ($opts['drive_commit_secret'] ?? ''));
  if ($secret === '') {
    return false;
  }
  $drive = (string) ($fields['drive_file_id'] ?? '');
  $width = (string) ($fields['width_in'] ?? '');
  $length = (string) ($fields['length_in'] ?? '');
  $dpi = (string) ($fields['dpi'] ?? '');
  $filename = (string) ($fields['filename'] ?? '');
  $exp = (string) ($fields['exp'] ?? '');
  $sig = (string) ($fields['sig'] ?? '');
  if ($drive === '' || $width === '' || $length === '' || $dpi === '' || $filename === '' || $exp === '' || $sig === '') {
    return false;
  }
  if (intval($exp) < time()) {
    return false;
  }
  $payload = implode('|', array($drive, $width, $length, $dpi, $filename, $exp));
  $expected = hash_hmac('sha256', $payload, $secret);
  return hash_equals($expected, $sig);
}
