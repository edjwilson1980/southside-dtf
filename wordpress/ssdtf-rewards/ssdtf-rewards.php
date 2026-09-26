<?php
/**
 * Plugin Name: South Side Rewards
 * Description: Customer rewards points, My Account thumbnails, and 60-day gang sheet reorder.
 * Version: 1.0.0
 * Author: South Side DTF
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * WC requires at least: 8.0
 * Text Domain: ssdtf-rewards
 */

if (!defined('ABSPATH')) {
  exit;
}

define('SSDTF_REWARDS_VERSION', '1.0.0');
define('SSDTF_REWARDS_DB_VERSION', '1.0.0');
define('SSDTF_REWARDS_FILE', __FILE__);
define('SSDTF_REWARDS_DIR', plugin_dir_path(__FILE__));
define('SSDTF_REWARDS_URL', plugin_dir_url(__FILE__));

require_once SSDTF_REWARDS_DIR . 'includes/class-settings.php';
require_once SSDTF_REWARDS_DIR . 'includes/class-db.php';
require_once SSDTF_REWARDS_DIR . 'includes/class-logger.php';
require_once SSDTF_REWARDS_DIR . 'includes/class-relay.php';
require_once SSDTF_REWARDS_DIR . 'includes/class-points.php';
require_once SSDTF_REWARDS_DIR . 'includes/class-files.php';
require_once SSDTF_REWARDS_DIR . 'includes/class-redeem.php';
require_once SSDTF_REWARDS_DIR . 'includes/class-reorder.php';
require_once SSDTF_REWARDS_DIR . 'includes/class-my-account.php';
require_once SSDTF_REWARDS_DIR . 'includes/class-emails.php';
require_once SSDTF_REWARDS_DIR . 'includes/class-cron.php';
require_once SSDTF_REWARDS_DIR . 'includes/class-admin.php';

add_action('before_woocommerce_init', function () {
  if (class_exists(\Automattic\WooCommerce\Utilities\FeaturesUtil::class)) {
    \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', SSDTF_REWARDS_FILE, true);
  }
});

register_activation_hook(__FILE__, function () {
  SSDTF_Rewards_DB::install();
  SSDTF_Rewards_Cron::schedule();
  update_option('ssdtf_rewards_db_version', SSDTF_REWARDS_DB_VERSION);
  // Encourage account creation (does not force guests off).
  update_option('woocommerce_enable_signup_and_login_from_checkout', 'yes');
  update_option('woocommerce_enable_myaccount_registration', 'yes');
  add_rewrite_endpoint('rewards', EP_ROOT | EP_PAGES);
  flush_rewrite_rules();
});

register_deactivation_hook(__FILE__, function () {
  SSDTF_Rewards_Cron::clear();
});

add_action('plugins_loaded', function () {
  if (!class_exists('WooCommerce')) {
    add_action('admin_notices', function () {
      echo '<div class="notice notice-error"><p>' . esc_html__('South Side Rewards requires WooCommerce.', 'ssdtf-rewards') . '</p></div>';
    });
    return;
  }
  SSDTF_Rewards_DB::maybe_upgrade();
  SSDTF_Rewards_Settings::init();
  SSDTF_Rewards_Points::init();
  SSDTF_Rewards_Files::init();
  SSDTF_Rewards_Redeem::init();
  SSDTF_Rewards_Reorder::init();
  SSDTF_Rewards_My_Account::init();
  SSDTF_Rewards_Emails::init();
  SSDTF_Rewards_Cron::init();
  if (is_admin()) {
    SSDTF_Rewards_Admin::init();
  }
});
