<?php
if (!defined('ABSPATH')) {
  exit;
}

class SSDTF_Rewards_Logger {
  public static function log($message, $level = 'info') {
    if (function_exists('wc_get_logger')) {
      wc_get_logger()->log($level, $message, array('source' => 'ssdtf-rewards'));
    } else {
      error_log('[ssdtf-rewards] ' . $message);
    }
  }
}
