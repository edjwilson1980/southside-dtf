<?php
if (!defined('ABSPATH')) {
  exit;
}

class SSDTF_Rewards_DB {
  public static function ledger_table() {
    global $wpdb;
    return $wpdb->prefix . 'ssdtf_points_ledger';
  }

  public static function files_table() {
    global $wpdb;
    return $wpdb->prefix . 'ssdtf_files';
  }

  public static function install() {
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $charset = $wpdb->get_charset_collate();
    $ledger = self::ledger_table();
    $files = self::files_table();

    $sql_ledger = "CREATE TABLE {$ledger} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      order_id BIGINT UNSIGNED NULL,
      type VARCHAR(20) NOT NULL,
      points INT NOT NULL,
      note VARCHAR(255) NOT NULL DEFAULT '',
      admin_id BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY  (id),
      KEY user_id (user_id),
      KEY order_id (order_id),
      KEY type (type)
    ) {$charset};";

    $sql_files = "CREATE TABLE {$files} (
      drive_file_id VARCHAR(128) NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      filename VARCHAR(255) NOT NULL DEFAULT '',
      product_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
      variation_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
      length_in DECIMAL(6,2) NOT NULL DEFAULT 0,
      width_in DECIMAL(6,2) NOT NULL DEFAULT 0,
      first_order_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
      last_order_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
      last_ordered_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      status VARCHAR(12) NOT NULL DEFAULT 'active',
      archived_at DATETIME NULL,
      reminder_sent_at DATETIME NULL,
      PRIMARY KEY  (drive_file_id),
      KEY user_id (user_id),
      KEY expires_at (expires_at),
      KEY status (status)
    ) {$charset};";

    dbDelta($sql_ledger);
    dbDelta($sql_files);
  }

  public static function maybe_upgrade() {
    $ver = get_option('ssdtf_rewards_db_version');
    if ($ver !== SSDTF_REWARDS_DB_VERSION) {
      self::install();
      update_option('ssdtf_rewards_db_version', SSDTF_REWARDS_DB_VERSION);
    }
  }
}
