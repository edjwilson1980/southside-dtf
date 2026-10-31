<?php
/**
 * Plugin Name: South Side Gang Sheet Builder
 * Description: Embed the South Side DTF customer gang sheet builder and UV DTF gang sheet builder, and add finished sheets (with optional Print & Press labor) to the WooCommerce cart.
 * Version: 1.31
 * Author: South Side DTF
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 * Text Domain: southside-gangsheet
 */

if (!defined('ABSPATH')) {
  exit;
}

define('SSGS_PLUGIN_VERSION', '1.31');
define('SSGS_DEFAULT_BUILDER_URL', 'https://southside-dtf.vercel.app');
/** WooCommerce attribute + term that marks a product as UV DTF (spec A9). */
define('SSGS_UV_DTF_ATTRIBUTE', 'pa_print_type');
define('SSGS_UV_DTF_TERM', 'uv-dtf');
/** UV DTF Square Cut is always 2.5 mm — the server never trusts the browser here. */
define('SSGS_UV_DTF_CUT_MM', 2.5);

function ssgs_default_options() {
  return array(
    'builder_url' => SSGS_DEFAULT_BUILDER_URL,
    'default_height' => 2400,
    'min_height' => 900,
    'product_id' => 0,
    'precut_product_id' => 0,
    'upload_product_id' => 0,
    'uv_dtf_product_id' => 0,
    'drive_commit_url' => SSGS_DEFAULT_BUILDER_URL . '/api/drive/finalize',
    'drive_commit_secret' => '',
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
  $out['upload_product_id'] = max(0, intval($input['upload_product_id'] ?? 0));
  $out['uv_dtf_product_id'] = max(0, intval($input['uv_dtf_product_id'] ?? 0));
  $commit_url = isset($input['drive_commit_url']) ? esc_url_raw(trim($input['drive_commit_url'])) : $out['drive_commit_url'];
  $out['drive_commit_url'] = untrailingslashit($commit_url ?: $out['drive_commit_url']);
  $out['drive_commit_secret'] = sanitize_text_field($input['drive_commit_secret'] ?? '');
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
    <p><code>[southside_gangsheet mode="upload"]</code> <?php esc_html_e('for the upload-your-own-sheet flow.', 'southside-gangsheet'); ?></p>
    <p><code>[southside_gangsheet mode="uv-dtf"]</code> <?php esc_html_e('for the UV DTF gang sheet builder (22 in wide, optional pre-cut).', 'southside-gangsheet'); ?></p>
    <p><code>[southside_artwork_intake]</code> <?php esc_html_e('for the customer send-us-your-artwork flow.', 'southside-gangsheet'); ?></p>
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
          <th scope="row"><label for="ssgs_upload_product_id"><?php esc_html_e('Upload product ID', 'southside-gangsheet'); ?></label></th>
          <td>
            <input name="ssgs_options[upload_product_id]" id="ssgs_upload_product_id" type="number" min="0" step="1" value="<?php echo esc_attr($opts['upload_product_id']); ?>" />
            <p class="description"><?php esc_html_e('The product for customer-uploaded gang sheets. Leave 0 to use the main gang sheet product.', 'southside-gangsheet'); ?></p>
          </td>
        </tr>
        <tr>
          <th scope="row"><label for="ssgs_uv_dtf_product_id"><?php esc_html_e('UV DTF product ID', 'southside-gangsheet'); ?></label></th>
          <td>
            <input name="ssgs_options[uv_dtf_product_id]" id="ssgs_uv_dtf_product_id" type="number" min="0" step="1" value="<?php echo esc_attr($opts['uv_dtf_product_id']); ?>" />
            <p class="description"><?php esc_html_e('The UV DTF sticker sheet product (22 in wide; variations by length, e.g. "22in x 12in"). Leave 0 to auto-detect: slug uv-dtf-stickers / uv-dtf, or the first product with attribute pa_print_type = uv-dtf.', 'southside-gangsheet'); ?></p>
            <?php
            $uv_detected = ssgs_resolve_uv_dtf_product_id();
            if ($uv_detected > 0) {
              $uv_product = function_exists('wc_get_product') ? wc_get_product($uv_detected) : null;
              printf(
                '<p class="description">%s</p>',
                esc_html(sprintf(
                  /* translators: 1: product id, 2: product name */
                  __('Currently using #%1$d — %2$s', 'southside-gangsheet'),
                  $uv_detected,
                  $uv_product ? $uv_product->get_name() : __('(product not found)', 'southside-gangsheet')
                ))
              );
            } else {
              printf('<p class="description" style="color:#b32d2e">%s</p>', esc_html__('No UV DTF product found yet — sticker Add to Cart will fail until one is set.', 'southside-gangsheet'));
            }
            ?>
          </td>
        </tr>
        <tr>
          <th scope="row"><label for="ssgs_drive_commit_url"><?php esc_html_e('Drive commit URL', 'southside-gangsheet'); ?></label></th>
          <td>
            <input name="ssgs_options[drive_commit_url]" id="ssgs_drive_commit_url" type="url" class="regular-text" value="<?php echo esc_attr($opts['drive_commit_url']); ?>" />
            <p class="description"><?php esc_html_e('Usually https://southside-dtf.vercel.app/api/drive/finalize — called after payment to rename the Drive file with the order number.', 'southside-gangsheet'); ?></p>
          </td>
        </tr>
        <tr>
          <th scope="row"><label for="ssgs_drive_commit_secret"><?php esc_html_e('Drive commit secret', 'southside-gangsheet'); ?></label></th>
          <td>
            <input name="ssgs_options[drive_commit_secret]" id="ssgs_drive_commit_secret" type="password" class="regular-text" value="<?php echo esc_attr($opts['drive_commit_secret']); ?>" autocomplete="new-password" />
            <p class="description"><?php esc_html_e('Must match SSGS_COMMIT_SECRET on the Next.js host. Leave blank to skip order-number rename.', 'southside-gangsheet'); ?></p>
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
add_shortcode('southside_artwork_intake', 'ssgs_render_intake_shortcode');

function ssgs_render_embed_iframe($base, $src, $title, $height, $fallback_label, $fallback_url = '') {
  $height = max(intval($height), 400);
  $id = 'ssgs-frame-' . uniqid();
  $fallback_url = $fallback_url ?: ($base . '/');

  wp_enqueue_script(
    'southside-gangsheet-embed',
    plugins_url('embed.js', __FILE__),
    array(),
    SSGS_PLUGIN_VERSION,
    true
  );
  wp_localize_script('southside-gangsheet-embed', 'ssgsEmbed', array(
    'minHeight' => intval(ssgs_get_options()['min_height']),
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
      title="<?php echo esc_attr($title); ?>"
      loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"
      allow="clipboard-write"
      style="width:100%;max-width:100%;height:<?php echo esc_attr($height); ?>px;border:0;border-radius:12px;background:#f4f8fb;"
    ></iframe>
    <p class="ssgs-embed-fallback">
      <a href="<?php echo esc_url($fallback_url); ?>" target="_blank" rel="noopener noreferrer">
        <?php echo esc_html($fallback_label); ?>
      </a>
    </p>
  </div>
  <?php
  return ob_get_clean();
}

function ssgs_render_shortcode($atts) {
  $opts = ssgs_get_options();
  $atts = shortcode_atts(array(
    'height' => $opts['default_height'],
    'title' => __('Build a Gang Sheet', 'southside-gangsheet'),
    'url' => '',
    'mode' => '',
  ), $atts, 'southside_gangsheet');

  $base = untrailingslashit($atts['url'] ?: $opts['builder_url']);
  $mode = strtolower(trim((string) $atts['mode']));
  // UV DTF is the UV DTF gang sheet builder (it replaced the sticker maker; old modes still work).
  if (in_array($mode, array('uv-dtf', 'uv_dtf', 'uvdtf', 'uv', 'stickers', 'sticker'), true)) {
    $mode = 'uv-dtf';
  }
  $paths = array(
    'upload' => '/embed/upload',
    'uv-dtf' => '/embed/uv-dtf',
  );
  $src = $base . ($paths[$mode] ?? '/embed');
  $height = max(intval($opts['min_height']), intval($atts['height']));
  $default_title = __('Build a Gang Sheet', 'southside-gangsheet');
  if ($mode === 'upload' && $atts['title'] === $default_title) {
    $atts['title'] = __('Upload a Gang Sheet', 'southside-gangsheet');
  }
  if ($mode === 'uv-dtf' && $atts['title'] === $default_title) {
    $atts['title'] = __('Build a UV DTF Gang Sheet', 'southside-gangsheet');
  }
  $fallback = $mode === 'uv-dtf'
    ? __('Open the UV DTF gang sheet builder in a new tab', 'southside-gangsheet')
    : __('Open the gang sheet builder in a new tab', 'southside-gangsheet');

  return ssgs_render_embed_iframe(
    $base,
    $src,
    $atts['title'],
    $height,
    $fallback,
    $mode === 'uv-dtf' ? $base . '/uv-dtf' : ''
  );
}

function ssgs_render_intake_shortcode($atts) {
  $opts = ssgs_get_options();
  $atts = shortcode_atts(array(
    'height' => $opts['default_height'],
    'title' => __('Send us your artwork', 'southside-gangsheet'),
    'url' => '',
  ), $atts, 'southside_artwork_intake');

  $base = untrailingslashit($atts['url'] ?: $opts['builder_url']);
  $height = max(intval($opts['min_height']), intval($atts['height']));

  return ssgs_render_embed_iframe(
    $base,
    $base . '/embed/send',
    $atts['title'],
    $height,
    __('Open Send us your artwork in a new tab', 'southside-gangsheet')
  );
}

add_action('wp_enqueue_scripts', function () {
  if (!is_singular()) {
    return;
  }
  $post = get_post();
  if (
    !$post
    || (
      !has_shortcode($post->post_content, 'southside_gangsheet')
      && !has_shortcode($post->post_content, 'southside_artwork_intake')
    )
  ) {
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
 * Purchasable variations with their roll length, shortest first.
 * "22in x 36in" -> 36 (the second number is the roll length, not the 22in width).
 */
function ssgs_variation_sizes($product) {
  if (!$product || !$product->is_type('variable')) {
    return array();
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

  usort($sizes, function ($a, $b) {
    return $a['length'] <=> $b['length'];
  });
  return $sizes;
}

/** Longest roll length the product sells (0 when it has no sized variations). */
function ssgs_max_variation_length($product) {
  $sizes = ssgs_variation_sizes($product);
  if (empty($sizes)) {
    return 0.0;
  }
  $largest = end($sizes);
  return floatval($largest['length']);
}

/**
 * Smallest variation whose roll length fits the sheet (>= target).
 * Returns 0 when the sheet is longer than every size — never silently bills the
 * largest sheet for a longer job. Over-length jobs are split into more sheets first
 * (see ssgs_split_billed_length).
 */
function ssgs_find_variation_id($product, $sheet_height_in) {
  $raw = floatval($sheet_height_in);
  if ($raw <= 0) {
    return 0;
  }
  // Floor so a print length like 36.49 in still matches a 36 in variation instead of
  // skipping ahead to the next size (e.g. 90 in when intermediate sizes are missing).
  $target = floor($raw + 1e-9);
  if ($target < 1) {
    $target = $raw;
  }

  foreach (ssgs_variation_sizes($product) as $size) {
    if ($size['length'] + 0.01 >= $target) {
      return $size['id'];
    }
  }
  return 0;
}

/**
 * Split a billed length that is longer than the largest sheet into per-sheet
 * lengths: 500 in on a 200 in max -> 200, 200, 100. Each part is then matched to
 * its own variation, so every sheet is billed on the ladder.
 */
function ssgs_split_billed_length($billed_in, $max_in) {
  $total = floatval($billed_in);
  $max = floatval($max_in);
  if ($total <= 0) {
    return array();
  }
  if ($max <= 0 || $total <= $max + 0.01) {
    return array($total);
  }
  $parts = array();
  $remaining = $total;
  while ($remaining > $max + 0.01) {
    $parts[] = $max;
    $remaining -= $max;
  }
  if ($remaining > 0.01) {
    $parts[] = $remaining;
  }
  return $parts;
}

/**
 * One cart line per sheet. The builder sends `sheets[]` for multi-sheet jobs
 * (each with its own Drive file); older payloads and intake jobs send a single
 * total, which is split here when it is longer than the largest sheet.
 */
function ssgs_payload_lines($payload, $max_in) {
  $lines = array();
  if (!empty($payload['sheets']) && is_array($payload['sheets'])) {
    $count = count($payload['sheets']);
    foreach (array_values($payload['sheets']) as $index => $sheet) {
      if (!is_array($sheet)) {
        continue;
      }
      $line = array_merge($payload, $sheet);
      unset($line['sheets']);
      if (empty($line['sheetIndex'])) {
        $line['sheetIndex'] = ($index + 1) . ' of ' . $count;
      }
      // The job-level build fee is charged once, on the first sheet.
      if ($index > 0) {
        $line['buildFee'] = 0;
      }
      $lines[] = $line;
    }
    if (!empty($lines)) {
      return $lines;
    }
  }

  $printed = floatval($payload['sheetHeightIn'] ?? 0);
  $billable = floatval($payload['billableHeightIn'] ?? 0);
  if ($billable <= 0 || $billable > $printed) {
    $billable = $printed;
  }
  $parts = ssgs_split_billed_length($billable, $max_in);
  if (count($parts) <= 1) {
    return array($payload);
  }

  $count = count($parts);
  foreach ($parts as $index => $part) {
    $line = $payload;
    $line['sheetIndex'] = ($index + 1) . ' of ' . $count;
    $line['billableHeightIn'] = $part;
    // Without per-sheet print lengths, each part prints as long as it bills.
    $line['sheetHeightIn'] = $part;
    if ($index > 0) {
      // Pre-cut and build fees are job totals — charge them once, on sheet 1.
      $line['precutTotal'] = 0;
      $line['buildFee'] = 0;
      $line['transfers'] = 0;
      $line['designs'] = 0;
    }
    $lines[] = $line;
  }
  return $lines;
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

/**
 * Resolve the UV DTF sticker sheet product: settings, then well-known slugs,
 * then the first product tagged pa_print_type = uv-dtf (spec A9).
 */
function ssgs_resolve_uv_dtf_product_id() {
  $opts = ssgs_get_options();
  $product_id = intval($opts['uv_dtf_product_id'] ?? 0);
  if ($product_id > 0) {
    return $product_id;
  }
  foreach (array('uv-dtf-stickers', 'uv-dtf-sticker-sheet', 'uv-dtf-gang-sheet', 'uv-dtf-sticker-maker', 'uv-dtf') as $slug) {
    $post = get_page_by_path($slug, OBJECT, 'product');
    if ($post && !empty($post->ID)) {
      return intval($post->ID);
    }
  }
  if (taxonomy_exists(SSGS_UV_DTF_ATTRIBUTE)) {
    $found = get_posts(array(
      'post_type' => 'product',
      'post_status' => 'publish',
      'posts_per_page' => 1,
      'fields' => 'ids',
      'orderby' => 'ID',
      'order' => 'ASC',
      'tax_query' => array(
        array(
          'taxonomy' => SSGS_UV_DTF_ATTRIBUTE,
          'field' => 'slug',
          'terms' => SSGS_UV_DTF_TERM,
        ),
      ),
    ));
    if (!empty($found)) {
      return intval($found[0]);
    }
  }
  return 0;
}

/**
 * Normalise the builder's print type. UV DTF stickers come from the sticker
 * maker (`printType: 'uv-dtf'`); everything else is standard DTF film.
 */
function ssgs_normalize_print_type($value) {
  $value = strtolower(trim((string) $value));
  $value = str_replace(array('_', ' '), '-', $value);
  if (in_array($value, array('uv-dtf', 'uvdtf', 'uv', 'uv-dtf-sticker', 'uv-dtf-stickers', 'sticker', 'stickers'), true)) {
    return 'uv-dtf';
  }
  return 'dtf';
}

function ssgs_print_type_label($print_type) {
  return $print_type === 'uv-dtf'
    ? __('UV DTF', 'southside-gangsheet')
    : __('DTF transfer', 'southside-gangsheet');
}

function ssgs_cut_label($cut_enabled) {
  return $cut_enabled
    ? sprintf(__('Square Cut %s mm', 'southside-gangsheet'), rtrim(rtrim(number_format(SSGS_UV_DTF_CUT_MM, 2, '.', ''), '0'), '.'))
    : __('No', 'southside-gangsheet');
}

/**
 * Print & Press labor ladder (per garment). Mirrors lib/print-press.ts — the
 * server recomputes the charge from the counts and never trusts the browser's total.
 */
function ssgs_print_press_tier($garments) {
  $garments = intval($garments);
  if ($garments >= 100) {
    return array('label' => '100+', 'first' => 1.5, 'second' => 0.75);
  }
  if ($garments >= 51) {
    return array('label' => '51-99', 'first' => 2.0, 'second' => 1.0);
  }
  if ($garments >= 21) {
    return array('label' => '21-50', 'first' => 3.0, 'second' => 1.25);
  }
  if ($garments >= 11) {
    return array('label' => '11-20', 'first' => 5.0, 'second' => 1.5);
  }
  return array('label' => '1-10', 'first' => 10.0, 'second' => 2.0);
}

define('SSGS_PRINT_PRESS_NAME_FEE', 0.5);

/**
 * Normalise the builder's `printPress` block into the cart-item fields.
 * Returns null when the payload has no (usable) Print & Press add-on.
 */
function ssgs_parse_print_press($payload) {
  $pp = isset($payload['printPress']) && is_array($payload['printPress']) ? $payload['printPress'] : null;
  if (!$pp) {
    return null;
  }
  $garments = max(0, intval($pp['garments'] ?? 0));
  if ($garments <= 0) {
    return null;
  }
  $double = min($garments, max(0, intval($pp['doublePress'] ?? 0)));
  $personalized = min($garments, max(0, intval($pp['personalized'] ?? 0)));
  $tier = ssgs_print_press_tier($garments);
  $first = round($garments * $tier['first'], 2);
  $second = round($double * $tier['second'], 2);
  $names = round($personalized * SSGS_PRINT_PRESS_NAME_FEE, 2);
  $labor = round($first + $second + $names, 2);

  $lines = array();
  if (!empty($pp['lines']) && is_array($pp['lines'])) {
    foreach ($pp['lines'] as $line) {
      if (!is_array($line)) {
        continue;
      }
      $sizes = array();
      if (!empty($line['sizes']) && is_array($line['sizes'])) {
        foreach ($line['sizes'] as $size => $qty) {
          $qty = intval($qty);
          if ($qty > 0) {
            $sizes[sanitize_text_field((string) $size)] = $qty;
          }
        }
      }
      $roster = array();
      if (!empty($line['roster']) && is_array($line['roster'])) {
        foreach (array_slice($line['roster'], 0, 500) as $name) {
          $name = sanitize_text_field((string) $name);
          if ($name !== '') {
            $roster[] = $name;
          }
        }
      }
      $lines[] = array(
        'garment' => sanitize_text_field($line['garment'] ?? ''),
        'color' => sanitize_text_field($line['color'] ?? ''),
        'location' => sanitize_text_field($line['location'] ?? 'front'),
        'quantity' => max(0, intval($line['quantity'] ?? 0)),
        'sizes' => $sizes,
        'personalized' => max(0, intval($line['personalized'] ?? 0)),
        'roster' => $roster,
        'frontDesign' => isset($line['frontDesign']) && $line['frontDesign'] !== null ? intval($line['frontDesign']) : null,
        'backDesign' => isset($line['backDesign']) && $line['backDesign'] !== null ? intval($line['backDesign']) : null,
        'frontDesignName' => sanitize_text_field($line['frontDesignName'] ?? ''),
        'backDesignName' => sanitize_text_field($line['backDesignName'] ?? ''),
      );
    }
  }

  $summary = sprintf('%d garments x %s', $garments, wp_strip_all_tags(wc_price($tier['first'])));
  if ($double > 0) {
    $summary .= sprintf(' + %d second side x %s', $double, wp_strip_all_tags(wc_price($tier['second'])));
  }
  if ($personalized > 0) {
    $summary .= sprintf(' + %d names x %s', $personalized, wp_strip_all_tags(wc_price(SSGS_PRINT_PRESS_NAME_FEE)));
  }
  $summary .= ' = ' . wp_strip_all_tags(wc_price($labor));

  return array(
    'garments' => $garments,
    'double' => $double,
    'personalized' => $personalized,
    'tier' => $tier['label'],
    'first_each' => $tier['first'],
    'second_each' => $tier['second'],
    'labor' => $labor,
    'summary' => $summary,
    'lines' => $lines,
    'press_sheet_url' => esc_url_raw($pp['pressSheetUrl'] ?? ''),
    'press_sheet_name' => sanitize_file_name($pp['pressSheetFileName'] ?? ''),
    'press_sheet_file_id' => sanitize_text_field($pp['pressSheetFileId'] ?? ''),
  );
}

function ssgs_print_press_location_label($location) {
  switch ($location) {
    case 'both':
      return __('Front + Back', 'southside-gangsheet');
    case 'chest-back':
      return __('Left chest logo + Back', 'southside-gangsheet');
    case 'chest':
      return __('Left chest logo', 'southside-gangsheet');
    case 'back':
      return __('Back', 'southside-gangsheet');
    default:
      return __('Front', 'southside-gangsheet');
  }
}

function ssgs_print_press_has_front($location) {
  return $location !== 'back';
}

function ssgs_print_press_has_back($location) {
  return in_array($location, array('back', 'both', 'chest-back'), true);
}

/** One readable line per garment row, for order notes and the admin screen. */
function ssgs_print_press_line_text($line) {
  $sizes = array();
  foreach ((array) ($line['sizes'] ?? array()) as $size => $qty) {
    $sizes[] = $size . ' ' . intval($qty);
  }
  $text = sprintf(
    '%s %s - %s - %d pcs',
    $line['color'] ?? '',
    $line['garment'] === 'hoodie' ? 'Hoodie' : 'T-shirt',
    ssgs_print_press_location_label($line['location'] ?? 'front'),
    intval($line['quantity'] ?? 0)
  );
  if (!empty($sizes)) {
    $text .= ' (' . implode(', ', $sizes) . ')';
  }
  $location = $line['location'] ?? 'front';
  if (ssgs_print_press_has_front($location) && !empty($line['frontDesign'])) {
    $side = in_array($location, array('chest', 'chest-back'), true) ? 'left chest' : 'front';
    $text .= sprintf(' - %s: design #%d %s', $side, intval($line['frontDesign']), $line['frontDesignName'] ?? '');
  }
  if (ssgs_print_press_has_back($location) && !empty($line['backDesign'])) {
    $text .= sprintf(' - back: design #%d %s', intval($line['backDesign']), $line['backDesignName'] ?? '');
  }
  if (!empty($line['personalized'])) {
    $text .= sprintf(' - %d personalized', intval($line['personalized']));
    if (!empty($line['roster'])) {
      $text .= ': ' . implode(', ', array_slice((array) $line['roster'], 0, 60));
      if (count((array) $line['roster']) > 60) {
        $text .= ', ...';
      }
    }
  }
  return trim($text);
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

  $payload_raw = isset($_POST['payload']) ? wp_unslash($_POST['payload']) : '';
  $payload = json_decode($payload_raw, true);
  if (!is_array($payload)) {
    wp_send_json_error(array('message' => 'Missing gang sheet cart payload.'), 400);
  }

  $opts = ssgs_get_options();
  $sheet_type = sanitize_text_field($payload['sheetType'] ?? 'built');
  // Older sticker builds sent sheetType "uv-dtf"; treat that as a built UV DTF sheet.
  $print_type = ssgs_normalize_print_type($payload['printType'] ?? ($sheet_type === 'uv-dtf' ? 'uv-dtf' : 'dtf'));
  if (!in_array($sheet_type, array('built', 'uploaded', 'intake'), true)) {
    $sheet_type = 'built';
  }
  $is_upload = ($sheet_type === 'uploaded');
  $is_uv_dtf = ($print_type === 'uv-dtf');
  // UV DTF: the sticker maker's fixed 2.5 mm Square Cut, or No Cut. Never a DTF pre-cut.
  $uv_cut_enabled = $is_uv_dtf && !empty($payload['cutEnabled']);
  // Print & Press (plugin 1.25+): labor charged once per job as a cart fee. The job
  // is always pre-cut, but the pre-cut fee is waived — the labor price covers it.
  $print_press = (!$is_uv_dtf && $sheet_type === 'built') ? ssgs_parse_print_press($payload) : null;

  if ($is_uv_dtf) {
    $product_id = ssgs_resolve_uv_dtf_product_id();
    if ($product_id <= 0) {
      wp_send_json_error(array('message' => 'Set the UV DTF product ID in Gang Sheet Builder settings (Settings → Gang Sheet Builder).'), 400);
    }
  } else {
    $product_id = $is_upload && intval($opts['upload_product_id']) > 0
      ? intval($opts['upload_product_id'])
      : ssgs_resolve_product_id();
    if ($product_id <= 0) {
      wp_send_json_error(array('message' => 'Set the WooCommerce product ID in Gang Sheet Builder settings (Build A Gangsheet).'), 400);
    }
  }

  $product = wc_get_product($product_id);
  if (!$product) {
    wp_send_json_error(array('message' => $is_uv_dtf ? 'UV DTF product not found.' : 'Gang sheet product not found.'), 404);
  }

  // Jobs longer than the largest sheet become more sheets ("1 of 3", "2 of 3"…),
  // each its own line on the ladder — never one 200 in line for 500 in of film.
  $max_in = $product->is_type('variable') ? ssgs_max_variation_length($product) : 0;
  $lines = ssgs_payload_lines($payload, $max_in);
  if (empty($lines)) {
    wp_send_json_error(array('message' => 'The builder did not send any sheets.'), 400);
  }
  $line_count = count($lines);

  // Validate every sheet before touching the cart, so a bad sheet 3 never leaves
  // sheets 1 and 2 behind as a half-added job.
  $prepared = array();
  foreach ($lines as $index => $line) {
    $sheet_label = $line_count > 1 ? sprintf(' (sheet %s)', sanitize_text_field($line['sheetIndex'] ?? ($index + 1))) : '';

    $file_url = esc_url_raw($line['fileUrl'] ?? '');
    $drive_file_id = sanitize_text_field($line['driveFileId'] ?? '');
    if ($file_url === '' || (strpos($file_url, 'drive.google.com') === false && strpos($file_url, 'docs.google.com') === false)) {
      wp_send_json_error(array('message' => 'Missing Google Drive file or folder link for this sheet' . $sheet_label . '.'), 400);
    }
    if ($drive_file_id === '' && preg_match('#/d/([^/]+)#', $file_url, $m)) {
      $drive_file_id = $m[1];
    }
    if ($drive_file_id === '' && preg_match('#/folders/([^/?]+)#', $file_url, $m)) {
      $drive_file_id = $m[1];
    }

    $printed_height = floatval($line['sheetHeightIn'] ?? 0);
    $billable_height = floatval($line['billableHeightIn'] ?? 0);

    if ($printed_height <= 0) {
      wp_send_json_error(array('message' => 'The builder did not send a sheet length' . $sheet_label . '.'), 400);
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
        $length_label = rtrim(rtrim(number_format($billable_height, 2, '.', ''), '0'), '.');
        wp_send_json_error(array('message' => $is_uv_dtf
          ? sprintf('No UV DTF sheet size fits %s in%s.', $length_label, $sheet_label)
          : sprintf('No gang sheet size fits %s in%s. The longest sheet is %s in.', $length_label, $sheet_label, rtrim(rtrim(number_format($max_in, 2, '.', ''), '0'), '.'))), 400);
      }
      $variation = wc_get_product_variation_attributes($variation_id);
    }

    $quantity = max(1, intval($line['quantity'] ?? 1));
    $source_w = floatval($line['sourceWidthIn'] ?? 0);
    $source_h = floatval($line['sourceHeightIn'] ?? 0);
    $cart_item_data = array(
      'ssgs_customer_name' => sanitize_text_field($line['customerName'] ?? ''),
      'ssgs_sheet_index' => sanitize_text_field($line['sheetIndex'] ?? ''),
      'ssgs_designs' => intval($line['designs'] ?? 0),
      'ssgs_transfers' => intval($line['transfers'] ?? 0),
      // Pre-cut companion line — DTF and UV DTF builder sheets both use it.
      'ssgs_precut' => (!empty($line['precut']) || $print_press) ? 'yes' : 'no',
      'ssgs_precut_total' => $print_press ? 0 : floatval($line['precutTotal'] ?? 0),
      // Build fee only for done-for-you intake — never self-serve builder or upload.
      'ssgs_build_fee' => ($sheet_type === 'intake') ? floatval($line['buildFee'] ?? 0) : 0,
      'ssgs_printed_height' => $printed_height,
      'ssgs_billed_height' => $billable_height,
      'ssgs_sheet_type' => $sheet_type,
      'ssgs_print_type' => $print_type,
      // Spec A7: Cut / No Cut for the whole UV DTF job; offset is always 2.5 mm.
      'ssgs_cut' => $is_uv_dtf ? ($uv_cut_enabled ? 'yes' : 'no') : '',
      'ssgs_cut_mm' => $uv_cut_enabled ? SSGS_UV_DTF_CUT_MM : '',
      'ssgs_source_size' => ($source_w > 0 && $source_h > 0)
        ? (rtrim(rtrim(number_format($source_w, 2, '.', ''), '0'), '.') . ' x ' . rtrim(rtrim(number_format($source_h, 2, '.', ''), '0'), '.') . ' in')
        : '',
      'ssgs_scale_factor' => isset($line['scaleFactor']) ? floatval($line['scaleFactor']) : '',
      'ssgs_effective_dpi' => isset($line['effectiveDpi']) ? floatval($line['effectiveDpi']) : '',
      'ssgs_dpi_source' => sanitize_text_field($line['dpiSource'] ?? ''),
      'ssgs_job_stamp' => sanitize_text_field($line['jobStamp'] ?? ''),
      'ssgs_print_file_name' => sanitize_file_name($line['printFileName'] ?? ''),
      'ssgs_cut_file_name' => sanitize_file_name($line['cutFileName'] ?? ''),
      'ssgs_cut_file_url' => esc_url_raw($line['cutFileUrl'] ?? ''),
      'ssgs_drive_file_id' => $drive_file_id,
      'ssgs_file_url' => $file_url,
      'ssgs_local_file' => '',
      'unique_key' => md5($file_url . '|' . $index . '|' . microtime(true)),
    );
    if ($print_press) {
      // Every sheet of the job is marked; the labor and press sheet ride on sheet 1 only.
      $cart_item_data['ssgs_pp'] = 'yes';
      if ($index === 0) {
        $cart_item_data['ssgs_pp_labor'] = $print_press['labor'];
        $cart_item_data['ssgs_pp_garments'] = $print_press['garments'];
        $cart_item_data['ssgs_pp_double'] = $print_press['double'];
        $cart_item_data['ssgs_pp_names'] = $print_press['personalized'];
        $cart_item_data['ssgs_pp_tier'] = $print_press['tier'];
        $cart_item_data['ssgs_pp_summary'] = $print_press['summary'];
        $cart_item_data['ssgs_pp_lines'] = wp_json_encode($print_press['lines']);
        $cart_item_data['ssgs_press_sheet_url'] = $print_press['press_sheet_url'];
        $cart_item_data['ssgs_press_sheet_name'] = $print_press['press_sheet_name'];
        $cart_item_data['ssgs_press_sheet_file_id'] = $print_press['press_sheet_file_id'];
      }
    }

    $prepared[] = array(
      'quantity' => $quantity,
      'variation_id' => $variation_id,
      'variation' => $variation,
      'cart_item_data' => $cart_item_data,
      'precut' => !empty($line['precut']) && !$print_press,
      'precut_total' => $print_press ? 0 : floatval($line['precutTotal'] ?? 0),
      'sheet_index' => sanitize_text_field($line['sheetIndex'] ?? ''),
      'transfers' => intval($line['transfers'] ?? 0),
      'file_url' => $file_url,
    );
  }

  $precut_id = intval($opts['precut_product_id']);
  $added_keys = array();
  foreach ($prepared as $entry) {
    $added = WC()->cart->add_to_cart($product_id, $entry['quantity'], $entry['variation_id'], $entry['variation'], $entry['cart_item_data']);
    if (!$added) {
      // Roll back so the customer never checks out with part of the job.
      foreach ($added_keys as $key) {
        WC()->cart->remove_cart_item($key);
      }
      wp_send_json_error(array('message' => $line_count > 1
        ? sprintf('WooCommerce could not add sheet %s to the cart.', $entry['sheet_index'])
        : 'WooCommerce could not add this sheet to the cart.'), 500);
    }
    $added_keys[] = $added;

    // Upload flow never sells pre-cut (precut is always false). Builder still uses Fix 2.
    // UV DTF builder sheets get the same per-transfer pre-cut line as DTF.
    if ($entry['precut'] && !$is_upload && $entry['precut_total'] > 0 && $precut_id > 0) {
      $companion = WC()->cart->add_to_cart($precut_id, $entry['quantity'], 0, array(), array(
        'ssgs_precut_amount' => $entry['precut_total'],
        'ssgs_precut_for' => $entry['cart_item_data']['unique_key'],
        'ssgs_precut_sheet' => $entry['sheet_index'],
        'ssgs_transfers' => $entry['transfers'],
        'unique_key' => md5('precut' . $entry['cart_item_data']['unique_key']),
      ));
      if ($companion) {
        $added_keys[] = $companion;
      }
    }
  }

  wp_send_json_success(array(
    'cartUrl' => wc_get_cart_url(),
    'fileUrl' => $prepared[0]['file_url'],
    'sheets' => $line_count,
    'printPressLabor' => $print_press ? $print_press['labor'] : 0,
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

// Build fee only when the cart item is a done-for-you intake sheet.
// Self-serve builder and upload carts never get this fee.
add_action('woocommerce_cart_calculate_fees', function ($cart) {
  if (is_admin() && !defined('DOING_AJAX')) {
    return;
  }
  if (!$cart instanceof WC_Cart) {
    return;
  }

  $fee = 0.0;
  foreach ($cart->get_cart() as $cart_item) {
    if (!empty($cart_item['ssgs_precut_for'])) {
      continue;
    }
    if (($cart_item['ssgs_sheet_type'] ?? '') !== 'intake') {
      continue;
    }
    $amount = floatval($cart_item['ssgs_build_fee'] ?? 0);
    if ($amount > 0) {
      $fee += $amount * max(1, intval($cart_item['quantity']));
    }
  }
  if ($fee > 0) {
    $cart->add_fee(__('Gang sheet build', 'southside-gangsheet'), $fee, true);
  }

  // Print & Press labor: once per job (it rides on sheet 1 of the job), not per sheet copy.
  $labor = 0.0;
  $garments = 0;
  foreach ($cart->get_cart() as $cart_item) {
    if (!empty($cart_item['ssgs_precut_for'])) {
      continue;
    }
    $amount = floatval($cart_item['ssgs_pp_labor'] ?? 0);
    if ($amount > 0) {
      $labor += $amount;
      $garments += intval($cart_item['ssgs_pp_garments'] ?? 0);
    }
  }
  if ($labor > 0) {
    $label = $garments > 0
      ? sprintf(__('Print & Press labor (%d garments)', 'southside-gangsheet'), $garments)
      : __('Print & Press labor', 'southside-gangsheet');
    $cart->add_fee($label, $labor, true);
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
  $is_uv_dtf = (($cart_item['ssgs_print_type'] ?? 'dtf') === 'uv-dtf');
  $map = array(
    'ssgs_customer_name' => __('Customer', 'southside-gangsheet'),
    'ssgs_sheet_index' => __('Sheet', 'southside-gangsheet'),
    'ssgs_designs' => __('Designs', 'southside-gangsheet'),
    'ssgs_transfers' => __('Transfers', 'southside-gangsheet'),
    'ssgs_precut' => __('Pre-cut', 'southside-gangsheet'),
    'ssgs_sheet_type' => __('Sheet type', 'southside-gangsheet'),
    'ssgs_source_size' => __('Source size', 'southside-gangsheet'),
    'ssgs_scale_factor' => __('Scale factor', 'southside-gangsheet'),
    'ssgs_effective_dpi' => __('Effective DPI', 'southside-gangsheet'),
    'ssgs_dpi_source' => __('DPI source', 'southside-gangsheet'),
  );
  if ($is_uv_dtf) {
    // UV DTF shows its cut as the "Cut" row below instead of a Pre-cut row.
    unset($map['ssgs_precut']);
  }
  foreach ($map as $key => $label) {
    if (!empty($cart_item[$key]) && empty($cart_item['ssgs_precut_for'])) {
      $item_data[] = array(
        'key' => $label,
        'value' => esc_html((string) $cart_item[$key]),
      );
    }
  }

  if (!empty($cart_item['ssgs_print_type']) && empty($cart_item['ssgs_precut_for'])) {
    $item_data[] = array(
      'key' => __('Print type', 'southside-gangsheet'),
      'value' => esc_html(ssgs_print_type_label($cart_item['ssgs_print_type'])),
    );
  }

  // Spec A7: visible "Cut: Square Cut 2.5 mm" or "Cut: No" on every UV DTF line.
  if ($is_uv_dtf && isset($cart_item['ssgs_cut']) && $cart_item['ssgs_cut'] !== '' && empty($cart_item['ssgs_precut_for'])) {
    $item_data[] = array(
      'key' => __('Cut', 'southside-gangsheet'),
      'value' => esc_html(ssgs_cut_label($cart_item['ssgs_cut'] === 'yes')),
    );
  }

  if (
    !empty($cart_item['ssgs_build_fee'])
    && empty($cart_item['ssgs_precut_for'])
    && ($cart_item['ssgs_sheet_type'] ?? '') === 'intake'
  ) {
    $item_data[] = array(
      'key' => __('Build fee', 'southside-gangsheet'),
      'value' => wc_price(floatval($cart_item['ssgs_build_fee'])),
    );
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

  if (($cart_item['ssgs_pp'] ?? '') === 'yes' && empty($cart_item['ssgs_precut_for'])) {
    if (!empty($cart_item['ssgs_pp_summary'])) {
      $item_data[] = array(
        'key' => __('Print & Press', 'southside-gangsheet'),
        'value' => esc_html((string) $cart_item['ssgs_pp_summary']),
      );
    } else {
      $item_data[] = array(
        'key' => __('Print & Press', 'southside-gangsheet'),
        'value' => esc_html__('Yes - labor on sheet 1', 'southside-gangsheet'),
      );
    }
    $item_data[] = array(
      'key' => __('Pre-cut fee', 'southside-gangsheet'),
      'value' => esc_html__('Included with Print & Press', 'southside-gangsheet'),
    );
    if (!empty($cart_item['ssgs_press_sheet_url'])) {
      $item_data[] = array(
        'key' => __('Press sheet', 'southside-gangsheet'),
        'value' => esc_url($cart_item['ssgs_press_sheet_url']),
      );
    }
  }

  if (!empty($cart_item['ssgs_file_url'])) {
    $item_data[] = array(
      'key' => __('File', 'southside-gangsheet'),
      'value' => esc_url($cart_item['ssgs_file_url']),
    );
  }
  if (!empty($cart_item['ssgs_cut_file_url']) && empty($cart_item['ssgs_precut_for'])) {
    $item_data[] = array(
      'key' => __('Cut file', 'southside-gangsheet'),
      'value' => esc_url($cart_item['ssgs_cut_file_url']),
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
    'ssgs_build_fee',
    'ssgs_printed_height',
    'ssgs_billed_height',
    'ssgs_precut_amount',
    'ssgs_precut_for',
    'ssgs_precut_sheet',
    'ssgs_sheet_type',
    'ssgs_print_type',
    'ssgs_cut',
    'ssgs_cut_mm',
    'ssgs_source_size',
    'ssgs_scale_factor',
    'ssgs_effective_dpi',
    'ssgs_dpi_source',
    'ssgs_job_stamp',
    'ssgs_print_file_name',
    'ssgs_cut_file_name',
    'ssgs_cut_file_url',
    'ssgs_drive_file_id',
    'ssgs_file_url',
    'ssgs_local_file',
    'ssgs_pp',
    'ssgs_pp_labor',
    'ssgs_pp_garments',
    'ssgs_pp_double',
    'ssgs_pp_names',
    'ssgs_pp_tier',
    'ssgs_pp_summary',
    'ssgs_press_sheet_url',
    'ssgs_press_sheet_name',
    'ssgs_press_sheet_file_id',
  ) as $key) {
    if (isset($values[$key]) && $values[$key] !== '' && $values[$key] !== 0 && $values[$key] !== 0.0) {
      $item->add_meta_data($key, $values[$key], true);
    }
  }

  // Print & Press garment lines: hidden JSON for tooling, readable rows for the crew.
  if (($values['ssgs_pp'] ?? '') === 'yes') {
    $item->add_meta_data('_ssp_print_press', 'yes', true);
    if (!empty($values['ssgs_pp_lines'])) {
      $item->add_meta_data('_ssgs_pp_lines', $values['ssgs_pp_lines'], true);
      $lines = json_decode((string) $values['ssgs_pp_lines'], true);
      if (is_array($lines)) {
        foreach (array_values($lines) as $index => $line) {
          if (!is_array($line)) {
            continue;
          }
          $item->add_meta_data(sprintf('ssgs_pp_line_%d', $index + 1), ssgs_print_press_line_text($line), true);
        }
      }
    }
  }

  // Spec A7: hidden production flag for UV DTF lines (`_` prefix keeps it off receipts).
  if (($values['ssgs_print_type'] ?? '') === 'uv-dtf') {
    $item->add_meta_data('_ssp_cut_enabled', ($values['ssgs_cut'] ?? 'no') === 'yes' ? 'yes' : 'no', true);
    $item->add_meta_data('_ssp_print_type', 'uv-dtf', true);
  }
}, 10, 3);

// Readable labels for the raw ssgs_* keys on order screens, emails, and receipts.
add_filter('woocommerce_order_item_display_meta_key', function ($display_key, $meta) {
  $labels = array(
    'ssgs_customer_name' => __('Customer', 'southside-gangsheet'),
    'ssgs_sheet_index' => __('Sheet', 'southside-gangsheet'),
    'ssgs_designs' => __('Designs', 'southside-gangsheet'),
    'ssgs_transfers' => __('Pieces', 'southside-gangsheet'),
    'ssgs_precut' => __('Pre-cut', 'southside-gangsheet'),
    'ssgs_precut_total' => __('Pre-cut total', 'southside-gangsheet'),
    'ssgs_build_fee' => __('Build fee', 'southside-gangsheet'),
    'ssgs_printed_height' => __('Printed length (in)', 'southside-gangsheet'),
    'ssgs_billed_height' => __('Billed length (in)', 'southside-gangsheet'),
    'ssgs_sheet_type' => __('Sheet type', 'southside-gangsheet'),
    'ssgs_print_type' => __('Print type', 'southside-gangsheet'),
    'ssgs_cut' => __('Cut', 'southside-gangsheet'),
    'ssgs_cut_mm' => __('Cut offset (mm)', 'southside-gangsheet'),
    'ssgs_source_size' => __('Source size', 'southside-gangsheet'),
    'ssgs_scale_factor' => __('Scale factor', 'southside-gangsheet'),
    'ssgs_effective_dpi' => __('Effective DPI', 'southside-gangsheet'),
    'ssgs_dpi_source' => __('DPI source', 'southside-gangsheet'),
    'ssgs_job_stamp' => __('Job stamp', 'southside-gangsheet'),
    'ssgs_print_file_name' => __('Print file', 'southside-gangsheet'),
    'ssgs_cut_file_name' => __('Cut file', 'southside-gangsheet'),
    'ssgs_cut_file_url' => __('Cut file link', 'southside-gangsheet'),
    'ssgs_drive_file_id' => __('Drive file ID', 'southside-gangsheet'),
    'ssgs_file_url' => __('File', 'southside-gangsheet'),
    'ssgs_pp' => __('Print & Press', 'southside-gangsheet'),
    'ssgs_pp_labor' => __('Print & Press labor', 'southside-gangsheet'),
    'ssgs_pp_garments' => __('Garments', 'southside-gangsheet'),
    'ssgs_pp_double' => __('Front + back garments', 'southside-gangsheet'),
    'ssgs_pp_names' => __('Personalized garments', 'southside-gangsheet'),
    'ssgs_pp_tier' => __('Print & Press tier', 'southside-gangsheet'),
    'ssgs_pp_summary' => __('Print & Press math', 'southside-gangsheet'),
    'ssgs_press_sheet_url' => __('Press sheet (PDF)', 'southside-gangsheet'),
    'ssgs_press_sheet_name' => __('Press sheet file', 'southside-gangsheet'),
    'ssgs_press_sheet_file_id' => __('Press sheet Drive ID', 'southside-gangsheet'),
  );
  $key = is_object($meta) && isset($meta->key) ? $meta->key : '';
  if (preg_match('/^ssgs_pp_line_(\d+)$/', $key, $m)) {
    return sprintf(__('Garment line %d', 'southside-gangsheet'), intval($m[1]));
  }
  return isset($labels[$key]) ? $labels[$key] : $display_key;
}, 10, 2);

add_filter('woocommerce_order_item_display_meta_value', function ($display_value, $meta) {
  $key = is_object($meta) && isset($meta->key) ? $meta->key : '';
  $value = is_object($meta) && isset($meta->value) ? $meta->value : '';
  if ($key === 'ssgs_print_type') {
    return esc_html(ssgs_print_type_label((string) $value));
  }
  if ($key === 'ssgs_cut') {
    return esc_html(ssgs_cut_label((string) $value === 'yes'));
  }
  if ($key === 'ssgs_pp') {
    return esc_html((string) $value === 'yes' ? __('Yes - pre-cut included', 'southside-gangsheet') : __('No', 'southside-gangsheet'));
  }
  if ($key === 'ssgs_pp_labor' && is_numeric($value)) {
    return wc_price(floatval($value));
  }
  return $display_value;
}, 10, 2);

// Staff note on the order with the whole Print & Press breakdown, so it is visible
// without opening line meta.
add_action('woocommerce_checkout_order_created', function ($order) {
  if (!$order instanceof WC_Order) {
    return;
  }
  foreach ($order->get_items() as $item) {
    if ($item->get_meta('ssgs_pp', true) !== 'yes' || !$item->get_meta('ssgs_pp_labor', true)) {
      continue;
    }
    $note = array(
      sprintf('PRINT & PRESS - %s', $item->get_meta('ssgs_pp_summary', true)),
      'Pre-cut included (no pre-cut fee). Customer supplies garments.',
    );
    $lines = json_decode((string) $item->get_meta('_ssgs_pp_lines', true), true);
    if (is_array($lines)) {
      foreach (array_values($lines) as $index => $line) {
        if (is_array($line)) {
          $note[] = sprintf('%d. %s', $index + 1, ssgs_print_press_line_text($line));
        }
      }
    }
    $press_sheet = $item->get_meta('ssgs_press_sheet_url', true);
    if ($press_sheet) {
      $note[] = 'Press sheet PDF: ' . $press_sheet;
    }
    $order->add_order_note(implode("\n", $note));
  }
}, 20, 1);

function ssgs_rename_drive_after_payment($order_id) {
  $opts = ssgs_get_options();
  $url = trim((string) ($opts['drive_commit_url'] ?? ''));
  $secret = trim((string) ($opts['drive_commit_secret'] ?? ''));
  if (!$url || !$secret) {
    return;
  }

  $order = wc_get_order($order_id);
  if (!$order || $order->get_meta('_ssgs_drive_renamed')) {
    return;
  }

  $renamed = 0;
  foreach ($order->get_items() as $item_id => $item) {
    $file_id = $item->get_meta('ssgs_drive_file_id', true);
    if (!$file_id) {
      continue;
    }
    $res = wp_remote_post($url, array(
      'timeout' => 30,
      'headers' => array(
        'Content-Type' => 'application/json',
        'X-SSGS-Secret' => $secret,
      ),
      'body' => wp_json_encode(array(
        'driveFileId' => $file_id,
        'orderNumber' => $order->get_order_number(),
      )),
    ));
    if (is_wp_error($res)) {
      error_log('[SSGS] finalize error: ' . $res->get_error_message());
      $order->add_order_note('Drive rename failed: ' . $res->get_error_message());
      $order->save();
      continue;
    }
    $code = wp_remote_retrieve_response_code($res);
    $body_raw = wp_remote_retrieve_body($res);
    error_log(sprintf('[SSGS] finalize %d: %s', $code, substr($body_raw, 0, 500)));
    if ($code !== 200) {
      $order->add_order_note('Drive rename failed: HTTP ' . $code);
      $order->save();
      continue;
    }
    $body = json_decode($body_raw, true);
    if (!empty($body['webViewLink'])) {
      $item->update_meta_data('ssgs_file_url', esc_url_raw($body['webViewLink']));
    }
    if (!empty($body['name'])) {
      $item->update_meta_data('ssgs_print_file_name', sanitize_file_name($body['name']));
    }
    $item->save();
    $renamed += 1;
  }

  if ($renamed > 0) {
    $order->update_meta_data('_ssgs_drive_renamed', current_time('mysql'));
    $order->add_order_note(sprintf('Renamed %d Drive file%s with order number.', $renamed, $renamed === 1 ? '' : 's'));
    $order->save();
  }
}

add_action('woocommerce_payment_complete', 'ssgs_rename_drive_after_payment');
add_action('woocommerce_order_status_processing', 'ssgs_rename_drive_after_payment');
add_action('woocommerce_order_status_completed', 'ssgs_rename_drive_after_payment');
