interface EventsInterface {
  beacon_domain: string;
  event_name: string;
  fastpix_embed?: string;
  fastpix_embed_version?: string;
  fastpix_sample_number?: string;
  fastpix_sample_rate?: number;
  fastpix_viewer_id?: string;
  fastpix_view_message?: string;
  page_load_time: number;
  page_referrer_url?: string;
  page_site_domain?: string;
  page_title?: string;
  player_startup_time: number;
  player_autoplay_on?: boolean;
  player_controls_on?: boolean;
  player_default_muted_on?: boolean;
  player_default_playback_rate?: number;
  player_error_business_exception?: boolean;
  player_error_code?: number;
  player_error_context?: string;
  player_error_message?: string;
  player_error_severity?: string;
  player_fastpix_sdk_name?: string;
  player_fastpix_sdk_version?: string;
  player_is_fullscreen?: boolean;
  player_is_pip?: boolean;
  player_height?: number;
  player_instance_id: string;
  player_language?: string;
  player_loop_on?: boolean;
  player_muted?: boolean;
  player_name?: string;
  player_is_paused?: boolean;
  player_playback_rate?: number;
  player_playhead_time: number;
  player_program_date_time?: number;
  player_poster_url?: string;
  player_preload_on?: boolean;
  player_sequence_number: number;
  player_software_name?: string;
  player_software_version?: string;
  player_subtitles_on?: boolean;
  player_subtitles_language_code?: string;
  player_view_count?: number;
  player_viewable_on?: boolean;
  player_viewable_percentage?: number;
  player_volume_level?: number;
  player_width?: number;
  // CMCD, read off the media request when the player emits it in query form
  request_cmcd_bitrate?: number;
  request_cmcd_buffer_length?: number;
  request_cmcd_buffer_starvation?: boolean;
  request_cmcd_content_id?: string;
  request_cmcd_deadline?: number;
  request_cmcd_max_bitrate?: number;
  request_cmcd_next_object?: string;
  request_cmcd_next_range?: string;
  request_cmcd_object_duration?: number;
  request_cmcd_object_type?: string;
  request_cmcd_playback_rate?: number;
  request_cmcd_requested_throughput?: number;
  request_cmcd_session_id?: string;
  request_cmcd_startup?: boolean;
  request_cmcd_stream_format?: string;
  request_cmcd_stream_type?: string;
  request_cmcd_throughput?: number;
  request_cmcd_version?: number;
  request_bytes_loaded?: number;
  request_hostname?: string;
  request_response_headers?: {};
  request_start?: number;
  request_type?: string;
  request_url?: string;
  request_response_end?: number;
  request_response_start?: number;
  request_event_type?: string;
  request_error_code?: number | string;
  request_error_message?: string;
  request_video_height?: number;
  request_video_width?: number;
  session_expiry_time: number;
  session_id?: string;
  session_start?: string;
  user_device_category?: string;
  viewer_browser_height?: number;
  viewer_browser_width?: number;
  viewer_connection_speed?: string;
  viewer_cookies_enabled?: boolean;
  viewer_device_orientation?: string;
  viewer_dnt_on?: boolean;
  viewer_timezone_name?: string;
  view_avg_request_throughput?: number;
  view_content_playback_time?: number;
  view_dropped_frame_count?: number | null;
  view_end_time?: number;
  view_event_count?: number;
  view_time_to_first_frame?: number;
  view_total_content_playback_time?: number;
  view_id: string;
  view_initial_audio_codec?: string;
  view_initial_bitrate?: number;
  view_initial_dynamic_range_type?: string;
  view_initial_fps?: number;
  view_initial_source_codec?: string;
  view_initial_source_height?: number;
  view_initial_source_width?: number;
  view_average_request_latency?: number;
  view_max_request_latency?: number;
  view_max_playhead_position?: number;
  view_max_downscaling_percentage?: number;
  view_max_upscaling_percentage?: number;
  view_min_request_throughput?: number;
  view_page_url?: string;
  view_playback_business_exception?: boolean;
  view_playback_failed?: boolean;
  view_rebuffer_count?: number;
  view_rendition_downshift_count?: number;
  view_rendition_upshift_count?: number;
  view_seek_count?: number;
  view_seek_duration?: number;
  view_max_seeek_time?: number;
  view_sequence_number: number;
  view_start_time?: number;
  view_startup_business_exception?: boolean;
  view_rebuffer_duration?: number;
  view_rebuffer_frequency?: number;
  view_rebuffer_percentage?: number;
  view_request_count?: number;
  view_total_downscaling?: number;
  view_total_upscaling?: number;
  view_watch_time?: number;
  viewer_id?: string;
  viewer_timestamp: number;
  video_cdn?: string;
  video_is_fullscreen?: boolean;
  video_series?: string;
  player_audio_language_code?: string;
  video_source_audio_bitrate?: number;
  video_source_audio_codec?: string;
  view_paused_duration?: number;
  // The share of view_paused_duration that fell outside an ad break. Attributed
  // by the ad state when the pause began, so a pause started during a preroll
  // stays ad time even if the viewer resumes after the break has ended.
  view_content_paused_duration?: number;
  view_played_count?: number;

  // Server side ad breaks, read from HLS Interstitials. A break is one
  // interruption; the ads inside it are assets, so one break of three ads is
  // one break and three impressions.
  view_has_ad?: boolean;
  // Whether this particular beacon was raised while an ad break was open. Sent
  // on every beacon, so play/pause/waiting/buffering can be told apart as ad or
  // content downstream without needing dedicated ad event names.
  view_is_ad_playing?: boolean;
  view_ad_break_count?: number;
  view_ad_break_id?: string;
  view_ad_break_position?: string;
  view_ad_playing_time?: number;
  view_ad_duration?: number;
  // Where the break interrupts the primary content timeline, in seconds
  view_ad_time_offset?: number;
  view_ad_asset_hostname?: string;
  // Only present when the SSAI vendor writes X-AD-SYSTEM onto the DATERANGE
  view_ad_system?: string;
  // Buffering that happened inside an ad break. Kept apart from
  // view_rebuffer_* so ad delivery problems do not read as content stalls.
  view_ad_rebuffer_count?: number;
  view_ad_rebuffer_duration?: number;
  view_ad_impression_count?: number;
  // hls.js generates this per asset - it is not a VAST Ad ID and must not be
  // joined against ad server data
  view_ad_asset_id?: string;
  view_ad_asset_index?: number;
  view_ad_asset_duration?: number;
  // Ads the player tried to play, successes and failures alike. The
  // denominator every ad error rate is computed against.
  view_ad_attempt_count?: number;
  view_ad_error_count?: number;
  // Failures that happened before the ad rendered anything, which a viewer
  // experiences as a dead pause rather than a broken ad
  view_ad_startup_error_count?: number;
  // Breaks containing at least one failure - a break with three failures
  // still counts once
  view_ad_break_error_count?: number;
  // Viewer abandoned the view during a break before any ad played
  view_ad_exit_before_start_count?: number;

  // Preroll fill and latency. requested comes from the manifest schedule, so
  // it is true even for a preroll that never fills - the pair is a fill rate.
  view_preroll_requested?: boolean;
  view_preroll_played?: boolean;
  view_preroll_request_time?: number;
  view_preroll_load_time?: number;
  view_preroll_request_count?: number;
  // Snapshotted at the first preroll break so later midrolls do not overwrite
  view_preroll_asset_hostname?: string;
  view_preroll_tag_hostname?: string;

  // VAST metadata. None of it exists in an HLS or DASH manifest - a playlist is
  // a delivery contract and VAST is a sales record - so the SDK never derives
  // these. They are here for an integrator running a client side ad SDK (IMA,
  // Yospace, DAI) to pass in through fp.dispatch, and stay absent otherwise.
  //
  // view_ad_id is the industry Ad ID, which is a different thing from
  // view_ad_asset_id - that one is generated by hls.js and means nothing
  // outside the player.
  view_ad_id?: string;
  view_ad_creative_id?: string;
  view_ad_advertiser_name?: string;
  view_ad_click_url?: string;
  view_ad_partner?: string;
  view_ad_deal_id?: string;
  // Seconds until the ad becomes skippable. HLS only has X-RESTRICT="SKIP",
  // which is a boolean, so this can only ever come from VAST.
  view_ad_skip_time_offset?: number;
  // The redirect chain between ad servers. SSAI resolves it before writing the
  // manifest, so a client can only know this from the ad SDK that walked it.
  view_ad_wrapper_id?: string;
  view_ad_wrapper_creative_ids?: string;
  view_ad_wrapper_systems?: string;
  // Names the player that raised the error, never a VAST error code
  view_ad_error_source?: string;
  view_ad_error_message?: string;
  view_ad_error_code?: string;
  // Whether the break survived the failure. hls.js forces fatal false on the
  // event payload itself, so this reflects the underlying error.
  view_ad_error_fatal?: boolean;
  // The ad stream being played, and the list or tag it came from
  view_ad_asset_url?: string;
  view_ad_tag_url?: string;
  // Correlates adrequest with adresponse. Required whenever requests can
  // overlap - a waterfall or a parallel pod fetch makes timestamp order
  // unreliable for matching them.
  view_ad_request_id?: string;
  // Ads the list actually returned. Zero is a no-fill, which is different
  // from an error and needs to be visible as such.
  view_ad_response_count?: number;
  // Ads that reached their end. Against view_ad_impression_count this is the
  // completion rate - how many of the ads that started were watched through.
  view_ad_complete_count?: number;
  view_ad_request_count?: number;

  view_last_rebuffer_start_time?: number;
  view_last_rendition_changed_time?: number;
  video_source_bitrate?: number;
  // Signed change in bps against the previous rendition, on the switch itself
  video_source_bitrate_shift?: number;
  video_source_codec?: string;
  video_source_dynamic_range_type?: string;
  video_source_domain?: string;
  video_source_duration?: number | null;
  video_source_fps?: number;
  video_source_height?: number;
  video_source_hostname?: string;
  video_source_live: boolean;
  video_source_rendition_name?: string;
  video_source_stream_protocol?: string;
  video_source_url?: string;
  video_source_buffer_length?: number;
  // Playing time accrued in one uninterrupted stretch at the rendition the rest
  // of the same beacon describes. Reset once reported, so a view visiting a
  // rendition twice reports two stretches and the consumer decides whether they
  // group together.
  video_source_playing_time?: number;
  view_aggregate_startup_time?: number;
}

interface UserCustomDataType {
  workspace_id?: string;
  application_name?: string;
  application_version?: string;
  content_id?: string;
  device_id?: string;
  video_id?: string;
  video_title?: string;
  viewer_id?: string;
  viewer_plan?: string;
  viewer_plan_category?: string;
  viewer_plan_status?: string;
  experiment_name?: string;
  page_context?: string;
  page_type?: string;
  player_captions_enabled?: boolean;
  player_init_time?: number | string; // Accepts a string because attribute-driven players read it via getAttribute;
  player_name?: string;
  player_pip_enabled?: boolean;
  player_version?: string;
  sub_property_id?: string;
  video_affiliate?: string;
  video_audio_codec?: string;
  video_brand?: string;
  video_cdn?: string;
  video_codec?: string;
  video_content_type?: string;
  video_creator_id?: string;
  video_description?: string;
  video_drm_type?: string;
  video_duration?: string;
  video_dynamic_range_type?: string;
  video_encoding_variant?: string;
  video_language_code?: string;
  video_media_tags?: string;
  video_producer?: string;
  video_series?: string;
  video_stream_type?: string;
  video_variant_name?: string;
  video_variant_id?: string;
  view_cdn_edge_pop?: string;
  view_cdn_origin?: string;
  view_drm_level?: string;
  view_session_id?: string;
  view_time_shift_enabled?: boolean;
  custom_1?: string;
  custom_2?: string;
  custom_3?: string;
  custom_4?: string;
  custom_5?: string;
  custom_6?: string;
  custom_7?: string;
  custom_8?: string;
  custom_9?: string;
  custom_10?: string;
}

interface OverrideableMetaData {
  browser?: string;
  browser_version?: string;
  cdn?: string;
  os_name?: string;
  os_version?: string;
  page_url?: string;
  player_autoplay_on?: boolean;
  player_height?: string;
  player_instance_id?: string;
  player_language_code?: string;
  video_poster_url?: string;
  player_preload_on?: string;
  player_remote_played?: boolean;
  player_software_name?: string;
  player_software_version?: string;
  player_fastpix_sdk_name?: string;
  player_fastpix_sdk_version?: string;
  video_source_height?: string;
  video_source_width?: string;
  player_width?: string;
  video_source_type?: string;
  player_is_fullscreen?: boolean;
  viewer_connection_type?: string;
  device_manufacturer?: string;
  device_category?: string;
  device_model?: string;
  device_name?: string;
}

interface EventMetaData extends Partial<EventsInterface>, UserCustomDataType {
  dashPlayer?: any;
  dashjs?: any;
  debug?: boolean;
  disableCookies?: boolean;
  respectDoNotTrack?: boolean;
  configDomain?: string;
  fetchStateData?: () => {
    player_is_paused: any;
    player_width: any;
    player_height: any;
    player_autoplay_on: any;
    player_preload_on: boolean;
    player_is_fullscreen: boolean;
    player_is_pip: boolean;
    player_muted: boolean;
    player_default_muted_on: boolean;
    player_volume_level: number;
    player_playback_rate: number;
    player_default_playback_rate: number;
    player_loop_on: boolean;
    player_controls_on: boolean;
    player_subtitles_on: boolean;
    player_subtitles_language_code: string | undefined;
    video_source_height: any;
    video_source_width: any;
    video_source_url: any;
    video_source_domain: string | undefined;
    video_source_hostname: string | undefined;
    video_source_duration: number;
    video_source_buffer_length: number | undefined;
    video_poster_url: any;
    player_language_code: any;
    view_dropped_frame_count: any;
    player_audio_language_code: string | undefined;
    player_viewable_on: boolean | undefined;
    player_viewable_percentage: number | undefined;
    video_source_stream_protocol: string | undefined;
  };
  fetchPlayheadTime?: () => number;
  data?: EventData;
  automaticErrorTracking?: boolean;
  Hls?: any;
  hlsjs?: any;
}

interface EventData extends UserCustomDataType, OverrideableMetaData {}

interface ActionableDataTypes {
  beaconDomain?: string;
  errorConverter?: any;
  disablePlayheadRebufferTracking?: boolean;
  allowRebufferTracking?: boolean;
  configDomain?: string;
  actionableData?: any;
  fetchPlayheadTime?: () => any;
  fetchStateData?: () => any;
  automaticErrorTracking?: boolean;
  data?: EventData;
  debug?: boolean;
  sampleRate?: string | number;
  disableCookies?: boolean;
  respectDoNotTrack?: boolean;
  beaconCollectionDomain?: string;
}

export type { EventMetaData, EventData, ActionableDataTypes };
