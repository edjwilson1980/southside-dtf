<?php
if (!defined('ABSPATH')) {
  exit;
}

class SSDTF_Rewards_Cron {
  const HOOK = 'ssdtf_rewards_daily';

  public static function init() {
    add_action(self::HOOK, array(__CLASS__, 'run'));
  }

  public static function schedule() {
    if (!wp_next_scheduled(self::HOOK)) {
      $tz = wp_timezone();
      $local = new DateTime('tomorrow 03:10:00', $tz);
      wp_schedule_event($local->getTimestamp(), 'daily', self::HOOK);
    }
  }

  public static function clear() {
    $ts = wp_next_scheduled(self::HOOK);
    if ($ts) {
      wp_unschedule_event($ts, self::HOOK);
    }
  }

  public static function run() {
    SSDTF_Rewards_Logger::log('Daily cron started');
    SSDTF_Rewards_Files::run_daily_maintenance();
    SSDTF_Rewards_Points::expire_stale_balances();
    SSDTF_Rewards_Logger::log('Daily cron finished');
  }
}
