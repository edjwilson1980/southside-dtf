<?php
/**
 * Plugin Name: South Side Gang Sheet Builder
 * Description: Embed the South Side DTF customer gang sheet builder on pages or WooCommerce products.
 * Version: 1.0.0
 * Author: South Side DTF
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 * Text Domain: southside-gangsheet
 */

if (!defined('ABSPATH')) {
  exit;
}

define('SSGS_PLUGIN_VERSION', '1.0.0');
define('SSGS_DEFAULT_BUILDER_URL', 'https://southside-dtf.vercel.app');

/**
 * Settings
 */
function ssgs_default_options() {
  return array(
    'builder_url' => SSGS_DEFAULT_BUILDER_URL,
    'default_height' => 2400,
    'min_height' => 900,
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
    <p><?php esc_html_e('Optional attributes:', 'southside-gangsheet'); ?> <code>height="2400"</code> <code>title="Build a Gang Sheet"</code></p>
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
    <hr />
    <h2><?php esc_html_e('WooCommerce tip', 'southside-gangsheet'); ?></h2>
    <ol>
      <li><?php esc_html_e('Edit your Build A Gangsheet product (or create a page).', 'southside-gangsheet'); ?></li>
      <li><?php esc_html_e('Add a Shortcode block with [southside_gangsheet].', 'southside-gangsheet'); ?></li>
      <li><?php esc_html_e('Publish. Customers build inside your site; pre-cut jobs still go to Google Drive.', 'southside-gangsheet'); ?></li>
    </ol>
  </div>
  <?php
}

/**
 * Shortcode: [southside_gangsheet height="2400" title="Build a Gang Sheet"]
 */
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
