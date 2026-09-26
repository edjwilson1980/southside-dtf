<?php
if (!defined('ABSPATH')) {
  exit;
}

class SSDTF_Rewards_Settings {
  const OPTION = 'ssdtf_rewards_settings';

  public static function defaults() {
    return array(
      'ssdtf_points_enabled' => 'yes',
      'ssdtf_earn_rate' => 1,
      'ssdtf_redeem_points' => 100,
      'ssdtf_redeem_value' => 5.0,
      'ssdtf_redeem_max_pct' => 50,
      'ssdtf_welcome_bonus' => 50,
      'ssdtf_welcome_trigger' => 'first_completed_order',
      'ssdtf_points_expiry_months' => 12,
      'ssdtf_file_hold_days' => 60,
      'ssdtf_archive_hold_days' => 60,
      'ssdtf_reminder_enabled' => 'no',
      'ssdtf_reminder_days' => 7,
      'ssdtf_reorder_products' => '115,4365',
      'ssdtf_relay_url' => 'https://southside-dtf.vercel.app',
      'ssdtf_relay_secret' => '', // blank → reuse southside-gangsheet drive_commit_secret
    );
  }

  public static function init() {
    add_action('admin_init', array(__CLASS__, 'register'));
  }

  public static function get($key = null) {
    $all = wp_parse_args(get_option(self::OPTION, array()), self::defaults());
    if ($key === null) {
      return $all;
    }
    return $all[$key] ?? (self::defaults()[$key] ?? null);
  }

  public static function get_bool($key) {
    $v = self::get($key);
    return $v === 'yes' || $v === '1' || $v === 1 || $v === true;
  }

  public static function get_float($key) {
    return floatval(self::get($key));
  }

  public static function get_int($key) {
    return intval(self::get($key));
  }

  public static function reorder_product_ids() {
    $raw = (string) self::get('ssdtf_reorder_products');
    $ids = array_filter(array_map('intval', preg_split('/[\s,]+/', $raw)));
    return array_values(array_unique($ids));
  }

  public static function relay_url() {
    return untrailingslashit((string) self::get('ssdtf_relay_url'));
  }

  public static function relay_secret() {
    $own = trim((string) self::get('ssdtf_relay_secret'));
    if ($own !== '') {
      return $own;
    }
    if (function_exists('ssgs_get_options')) {
      $opts = ssgs_get_options();
      return trim((string) ($opts['drive_commit_secret'] ?? ''));
    }
    return '';
  }

  public static function register() {
    register_setting('ssdtf_rewards', self::OPTION, array(
      'type' => 'array',
      'sanitize_callback' => array(__CLASS__, 'sanitize'),
      'default' => self::defaults(),
    ));
  }

  public static function sanitize($input) {
    $out = self::defaults();
    if (!is_array($input)) {
      return $out;
    }
    $out['ssdtf_points_enabled'] = !empty($input['ssdtf_points_enabled']) ? 'yes' : 'no';
    $out['ssdtf_earn_rate'] = max(0, floatval($input['ssdtf_earn_rate'] ?? 1));
    $out['ssdtf_redeem_points'] = max(1, intval($input['ssdtf_redeem_points'] ?? 100));
    $out['ssdtf_redeem_value'] = max(0, floatval($input['ssdtf_redeem_value'] ?? 5));
    $out['ssdtf_redeem_max_pct'] = min(100, max(0, floatval($input['ssdtf_redeem_max_pct'] ?? 50)));
    $out['ssdtf_welcome_bonus'] = max(0, intval($input['ssdtf_welcome_bonus'] ?? 50));
    $trigger = sanitize_text_field($input['ssdtf_welcome_trigger'] ?? 'first_completed_order');
    $out['ssdtf_welcome_trigger'] = in_array($trigger, array('first_completed_order', 'registration'), true)
      ? $trigger
      : 'first_completed_order';
    $out['ssdtf_points_expiry_months'] = max(0, intval($input['ssdtf_points_expiry_months'] ?? 12));
    $out['ssdtf_file_hold_days'] = max(1, intval($input['ssdtf_file_hold_days'] ?? 60));
    $out['ssdtf_archive_hold_days'] = max(1, intval($input['ssdtf_archive_hold_days'] ?? 60));
    $out['ssdtf_reminder_enabled'] = !empty($input['ssdtf_reminder_enabled']) ? 'yes' : 'no';
    $out['ssdtf_reminder_days'] = max(1, intval($input['ssdtf_reminder_days'] ?? 7));
    $out['ssdtf_reorder_products'] = sanitize_text_field($input['ssdtf_reorder_products'] ?? '115,4365');
    $url = isset($input['ssdtf_relay_url']) ? esc_url_raw(trim($input['ssdtf_relay_url'])) : '';
    $out['ssdtf_relay_url'] = untrailingslashit($url ?: $out['ssdtf_relay_url']);
    if (isset($input['ssdtf_relay_secret']) && $input['ssdtf_relay_secret'] !== '') {
      $out['ssdtf_relay_secret'] = sanitize_text_field($input['ssdtf_relay_secret']);
    } else {
      $prev = get_option(self::OPTION, array());
      $out['ssdtf_relay_secret'] = is_array($prev) ? (string) ($prev['ssdtf_relay_secret'] ?? '') : '';
    }
    return $out;
  }
}
