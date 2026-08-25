import pytest

from conftest import warp_to

GEN = 10**18

NOW = "2099-01-01T00:00:00Z"
WINDOW_START = "2099-01-10T00:00:00Z"
WINDOW_END = "2099-01-20T00:00:00Z"
AFTER_WINDOW_END = "2099-01-20T00:00:01Z"
BEFORE_WINDOW_END = "2099-01-19T23:59:59Z"
AFTER_COOLDOWN = "2099-01-20T00:31:00Z"
AFTER_EXPIRE_GRACE = "2099-02-19T00:00:02Z"  # 30 days after WINDOW_END
JUST_BEFORE_EXPIRE_GRACE = "2099-02-18T23:59:59Z"
AFTER_LOCKUP = "2099-01-08T00:00:01Z"  # 7 days after NOW


# --- pool / cover setup helpers ---

def fund_pool(contract, direct_vm, lp, amount=100 * GEN):
    direct_vm.sender = lp
    direct_vm.value = amount
    minted = contract.provide_liquidity()
    direct_vm.value = 0
    return minted


def mock_weather(direct_vm, status="FOUND", reading="50.0", reason="Clear peak reading."):
    direct_vm.clear_mocks()
    direct_vm.mock_web(
        r".*archive-api\.open-meteo\.com.*",
        {"status": 200, "body": '{"daily":{"precipitation_sum":[10.0,50.0,5.0]}}'},
    )
    direct_vm.mock_web(
        r".*news\.google\.com.*",
        {"status": 200, "body": "<rss><channel><item><title>Storm reported in the area</title></item></channel></rss>"},
    )
    direct_vm.mock_llm(
        r".*extracting a single numeric reading.*",
        f'{{"status":"{status}","reading":"{reading}","source_a_summary":"peak reading found",'
        f'"source_b_summary":"corroborating news found","rationale":"{reason}"}}',
    )


def mock_price(direct_vm, status="FOUND", reading="45000.0", reason="Clear historical reading."):
    direct_vm.clear_mocks()
    direct_vm.mock_web(
        r".*api\.coingecko\.com.*",
        {"status": 200, "body": '{"market_data":{"current_price":{"usd":45000.0}}}'},
    )
    direct_vm.mock_web(
        r".*news\.google\.com.*",
        {"status": 200, "body": "<rss><channel><item><title>Price moved sharply</title></item></channel></rss>"},
    )
    direct_vm.mock_llm(
        r".*extracting a single numeric reading.*",
        f'{{"status":"{status}","reading":"{reading}","source_a_summary":"price found",'
        f'"source_b_summary":"news found","rationale":"{reason}"}}',
    )


def mock_news_event(direct_vm, status="RESOLVED", outcome="OUTCOME_A", reason="Clear evidence."):
    direct_vm.clear_mocks()
    direct_vm.mock_web(
        r".*api\.github\.com.*",
        {"status": 200, "body": '{"items":[{"title":"related issue"}]}'},
    )
    direct_vm.mock_web(
        r".*news\.google\.com.*",
        {"status": 200, "body": "<rss><channel><item><title>Event reported by outlets</title></item></channel></rss>"},
    )
    direct_vm.mock_web(
        r".*wikipedia\.org.*",
        {"status": 200, "body": '{"query":{"search":[{"title":"Subject"}]}}'},
    )
    direct_vm.mock_llm(
        r".*classifying a real-world event.*",
        f'{{"status":"{status}","outcome":"{outcome}","source_a_summary":"a","source_b_summary":"b",'
        f'"source_c_summary":"c","rationale":"{reason}"}}',
    )


def open_weather_cover(
    contract, direct_vm, buyer,
    subject="NYC storm cover", keywords="NYC severe storm",
    window_start=WINDOW_START, window_end=WINDOW_END, coverage_amount=GEN,
    threshold_metric="precipitation_mm", threshold_value="40.0",
    lat="40.7", lon="-74.0",
):
    premium = (coverage_amount * 400) // 10000
    direct_vm.sender = buyer
    direct_vm.value = premium
    cid = contract.open_cover(
        "PERIL-WEATHER", subject, keywords, window_start, window_end, coverage_amount,
        lat, lon, threshold_metric, ">=", threshold_value, "", [], [],
    )
    direct_vm.value = 0
    return cid


def open_price_cover(
    contract, direct_vm, buyer,
    subject="BTC drop cover", keywords="Bitcoin price drop",
    window_start=WINDOW_START, window_end=WINDOW_END, coverage_amount=GEN,
    asset_id="bitcoin", comparator="<=", threshold_value="40000.0",
):
    premium = (coverage_amount * 300) // 10000
    direct_vm.sender = buyer
    direct_vm.value = premium
    cid = contract.open_cover(
        "PERIL-PRICE", subject, keywords, window_start, window_end, coverage_amount,
        "", "", "", comparator, threshold_value, asset_id, [], [],
    )
    direct_vm.value = 0
    return cid


def open_news_cover(
    contract, direct_vm, buyer,
    subject="Aurora Labs mainnet launch cover", keywords="Aurora Labs mainnet launch",
    window_start=WINDOW_START, window_end=WINDOW_END, coverage_amount=GEN,
    allowed_outcomes=None, triggering_outcomes=None,
):
    if allowed_outcomes is None:
        allowed_outcomes = ["LAUNCH_DELAYED", "LAUNCH_ON_TIME"]
    if triggering_outcomes is None:
        triggering_outcomes = ["LAUNCH_DELAYED"]
    premium = (coverage_amount * 600) // 10000
    direct_vm.sender = buyer
    direct_vm.value = premium
    cid = contract.open_cover(
        "PERIL-NEWS", subject, keywords, window_start, window_end, coverage_amount,
        "", "", "", "", "", "", allowed_outcomes, triggering_outcomes,
    )
    direct_vm.value = 0
    return cid


# --- registry ---


def test_seeded_peril_types_exist_with_correct_adapters(contract, direct_vm):
    types = contract.list_peril_types()
    adapters = {p["id"]: p["adapter"] for p in types}
    assert adapters["PERIL-WEATHER"] == "WEATHER"
    assert adapters["PERIL-PRICE"] == "PRICE_THRESHOLD"
    assert adapters["PERIL-NEWS"] == "NEWS_EVENT"


def test_register_peril_type_rejects_non_admin(contract, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.register_peril_type("Custom peril", "WEATHER", "A custom peril type", 2, 1000, 300)


def test_register_peril_type_rejects_unknown_adapter(contract, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        contract.register_peril_type("Custom peril", "EARTHQUAKE", "A custom peril type", 2, 1000, 300)


def test_register_peril_type_rejects_min_sources_below_two(contract, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        contract.register_peril_type("Custom peril", "WEATHER", "A custom peril type", 1, 1000, 300)


def test_register_peril_type_succeeds_for_admin(contract, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    peril_id = contract.register_peril_type("Custom peril", "NEWS_EVENT", "A custom peril type", 2, 500, 250)
    peril = contract.get_peril_type(peril_id)
    assert peril["name"] == "Custom peril"
    assert peril["premium_rate_bps"] == 250


def test_set_peril_type_active_rejects_non_admin(contract, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.set_peril_type_active("PERIL-WEATHER", False)


def test_set_peril_type_active_succeeds_for_admin(contract, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    contract.set_peril_type_active("PERIL-WEATHER", False)
    assert contract.get_peril_type("PERIL-WEATHER")["active"] is False


# --- liquidity ---


def test_provide_liquidity_rejects_zero_value(contract, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    direct_vm.value = 0
    with pytest.raises(Exception):
        contract.provide_liquidity()


def test_provide_liquidity_first_deposit_mints_1_to_1(contract, direct_vm, direct_bob):
    minted = fund_pool(contract, direct_vm, direct_bob, 10 * GEN)
    assert minted == 10 * GEN
    summary = contract.get_pool_summary()
    assert summary["pool_nav"] == str(10 * GEN)
    assert summary["total_shares"] == str(10 * GEN)


def test_provide_liquidity_second_deposit_is_proportional_after_nav_changes(
    contract, direct_vm, direct_bob, direct_charlie
):
    fund_pool(contract, direct_vm, direct_bob, 10 * GEN)
    warp_to(direct_vm, NOW)
    # A premium payment raises NAV without minting new shares, changing the share price.
    open_weather_cover(contract, direct_vm, direct_charlie, coverage_amount=1 * GEN)
    nav_before = int(contract.get_pool_summary()["pool_nav"])
    shares_before = int(contract.get_pool_summary()["total_shares"])
    minted = fund_pool(contract, direct_vm, direct_charlie, 5 * GEN)
    assert minted == (5 * GEN * shares_before) // nav_before


def test_get_lp_position_reflects_shares_and_value(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 10 * GEN)
    position = contract.get_lp_position(direct_bob)
    assert position["shares"] == 10 * GEN
    assert position["value_wei"] == str(10 * GEN)


def test_request_withdrawal_rejects_no_position(contract, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.request_withdrawal(1 * GEN)


def test_request_withdrawal_rejects_more_than_owned(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 10 * GEN)
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.request_withdrawal(11 * GEN)


def test_request_withdrawal_reduces_active_shares_immediately(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 10 * GEN)
    warp_to(direct_vm, NOW)
    direct_vm.sender = direct_bob
    contract.request_withdrawal(4 * GEN)
    assert contract.get_lp_position(direct_bob)["shares"] == 6 * GEN


def test_request_withdrawal_rejects_a_second_pending_request(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 10 * GEN)
    warp_to(direct_vm, NOW)
    direct_vm.sender = direct_bob
    contract.request_withdrawal(2 * GEN)
    with pytest.raises(Exception):
        contract.request_withdrawal(1 * GEN)


def test_execute_withdrawal_rejects_before_lockup_elapses(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 10 * GEN)
    warp_to(direct_vm, NOW)
    direct_vm.sender = direct_bob
    contract.request_withdrawal(4 * GEN)
    with pytest.raises(Exception):
        contract.execute_withdrawal()


def test_execute_withdrawal_succeeds_after_lockup(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 10 * GEN)
    warp_to(direct_vm, NOW)
    direct_vm.sender = direct_bob
    contract.request_withdrawal(4 * GEN)
    warp_to(direct_vm, AFTER_LOCKUP)
    direct_vm.sender = direct_bob
    payout = contract.execute_withdrawal()
    assert payout == 4 * GEN  # NAV unchanged since request, so 1:1


def test_execute_withdrawal_rejects_a_second_execution(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 10 * GEN)
    warp_to(direct_vm, NOW)
    direct_vm.sender = direct_bob
    contract.request_withdrawal(4 * GEN)
    warp_to(direct_vm, AFTER_LOCKUP)
    direct_vm.sender = direct_bob
    contract.execute_withdrawal()
    with pytest.raises(Exception):
        contract.execute_withdrawal()


# --- open_cover: shared + WEATHER-specific validation ---


def test_open_cover_rejects_unknown_peril_type(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    direct_vm.sender = direct_bob
    direct_vm.value = 1 * GEN
    with pytest.raises(Exception):
        contract.open_cover(
            "PERIL-NOPE", "Subject", "keywords here", WINDOW_START, WINDOW_END, 1 * GEN,
            "40.7", "-74.0", "precipitation_mm", ">=", "40.0", "", [], [],
        )


def test_open_cover_rejects_inactive_peril_type(contract, direct_vm, direct_alice, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    direct_vm.sender = direct_alice
    contract.set_peril_type_active("PERIL-WEATHER", False)
    warp_to(direct_vm, NOW)
    with pytest.raises(Exception):
        open_weather_cover(contract, direct_vm, direct_bob)


def test_open_cover_rejects_unsafe_keyword_characters(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    with pytest.raises(Exception):
        open_weather_cover(contract, direct_vm, direct_bob, keywords="NYC & severe storm")


def test_open_cover_rejects_zero_coverage_amount(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    with pytest.raises(Exception):
        open_weather_cover(contract, direct_vm, direct_bob, coverage_amount=0)


def test_open_cover_rejects_window_end_before_start(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    with pytest.raises(Exception):
        open_weather_cover(contract, direct_vm, direct_bob, window_start=WINDOW_END, window_end=WINDOW_START)


def test_open_cover_rejects_span_over_400_days(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    with pytest.raises(Exception):
        open_weather_cover(
            contract, direct_vm, direct_bob,
            window_start="2099-01-10T00:00:00Z", window_end="2100-06-01T00:00:00Z",
        )


def test_open_cover_rejects_window_start_not_in_the_future(contract, direct_vm, direct_bob):
    warp_to(direct_vm, WINDOW_START)  # "now" is at or after window_start
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    with pytest.raises(Exception):
        open_weather_cover(contract, direct_vm, direct_bob, window_start=WINDOW_START, window_end=WINDOW_END)


def test_open_cover_rejects_invalid_latitude(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    with pytest.raises(Exception):
        open_weather_cover(contract, direct_vm, direct_bob, lat="140.0")


def test_open_cover_rejects_unknown_weather_metric(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    with pytest.raises(Exception):
        open_weather_cover(contract, direct_vm, direct_bob, threshold_metric="earthquake_magnitude")


def test_open_cover_rejects_non_gte_comparator_for_weather(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    direct_vm.sender = direct_bob
    direct_vm.value = (GEN * 400) // 10000
    with pytest.raises(Exception):
        contract.open_cover(
            "PERIL-WEATHER", "Subject", "keywords here", WINDOW_START, WINDOW_END, GEN,
            "40.7", "-74.0", "precipitation_mm", "<=", "40.0", "", [], [],
        )


def test_open_cover_rejects_malformed_threshold_value(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    with pytest.raises(Exception):
        open_weather_cover(contract, direct_vm, direct_bob, threshold_value="not-a-number")


def test_open_cover_rejects_infinity_as_threshold_value(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    with pytest.raises(Exception):
        open_weather_cover(contract, direct_vm, direct_bob, threshold_value="inf")


def test_open_cover_rejects_wrong_premium_value(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    direct_vm.sender = direct_bob
    direct_vm.value = 1  # far too low
    with pytest.raises(Exception):
        contract.open_cover(
            "PERIL-WEATHER", "Subject", "keywords here", WINDOW_START, WINDOW_END, GEN,
            "40.7", "-74.0", "precipitation_mm", ">=", "40.0", "", [], [],
        )


def test_open_cover_rejects_exceeding_pool_wide_utilization_cap_across_multiple_covers(contract, direct_vm, direct_bob):
    # Isolate the pool-wide cap from the (much stricter, per-cover) peril concentration cap:
    # three 20 GEN covers each sit exactly at WEATHER's own 20%-of-NAV concentration limit
    # against a 100 GEN pool, so none of them trips the per-peril cap individually. A fourth
    # would push cumulative reserved liability to 80 GEN, over the pool-wide 70% (70 GEN) cap.
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    open_weather_cover(contract, direct_vm, direct_bob, coverage_amount=20 * GEN)
    open_weather_cover(contract, direct_vm, direct_bob, coverage_amount=20 * GEN)
    open_weather_cover(contract, direct_vm, direct_bob, coverage_amount=20 * GEN)
    assert contract.get_pool_summary()["reserved_liability"] == str(60 * GEN)
    with pytest.raises(Exception):
        open_weather_cover(contract, direct_vm, direct_bob, coverage_amount=20 * GEN)


def test_open_cover_rejects_exceeding_per_peril_concentration_cap(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)  # plenty of pool-wide capacity
    warp_to(direct_vm, NOW)
    with pytest.raises(Exception):
        # WEATHER's own cap is 20% of NAV -- 25 GEN coverage against a 100 GEN pool exceeds it
        # even though pool-wide utilization would still be fine.
        open_weather_cover(contract, direct_vm, direct_bob, coverage_amount=25 * GEN)


def test_open_cover_weather_success_stores_fields_and_updates_pool(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    nav_before = int(contract.get_pool_summary()["pool_nav"])
    cid = open_weather_cover(contract, direct_vm, direct_bob, coverage_amount=2 * GEN)
    cover = contract.get_cover(cid)
    assert cover["peril_type_id"] == "PERIL-WEATHER"
    assert cover["resolved"] is False
    premium = (2 * GEN * 400) // 10000
    assert cover["premium_paid"] == str(premium)
    summary = contract.get_pool_summary()
    assert int(summary["pool_nav"]) == nav_before + premium
    assert summary["reserved_liability"] == str(2 * GEN)


# --- open_cover: PRICE_THRESHOLD-specific validation ---


def test_open_cover_price_rejects_bad_asset_id(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    with pytest.raises(Exception):
        open_price_cover(contract, direct_vm, direct_bob, asset_id="Bitcoin USD!")


def test_open_cover_price_rejects_bad_comparator(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    direct_vm.sender = direct_bob
    direct_vm.value = (GEN * 300) // 10000
    with pytest.raises(Exception):
        contract.open_cover(
            "PERIL-PRICE", "Subject", "keywords here", WINDOW_START, WINDOW_END, GEN,
            "", "", "", "==", "40000.0", "bitcoin", [], [],
        )


def test_open_cover_price_rejects_nonempty_location_fields(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    direct_vm.sender = direct_bob
    direct_vm.value = (GEN * 300) // 10000
    with pytest.raises(Exception):
        contract.open_cover(
            "PERIL-PRICE", "Subject", "keywords here", WINDOW_START, WINDOW_END, GEN,
            "40.7", "", "", "<=", "40000.0", "bitcoin", [], [],
        )


def test_open_cover_price_success_with_lte_comparator(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_price_cover(contract, direct_vm, direct_bob, comparator="<=", threshold_value="40000.0")
    cover = contract.get_cover(cid)
    assert cover["threshold_comparator"] == "<="
    assert cover["asset_id"] == "bitcoin"


# --- open_cover: NEWS_EVENT-specific validation ---


def test_open_cover_news_rejects_nonempty_threshold_fields(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    direct_vm.sender = direct_bob
    direct_vm.value = (GEN * 600) // 10000
    with pytest.raises(Exception):
        contract.open_cover(
            "PERIL-NEWS", "Subject", "keywords here", WINDOW_START, WINDOW_END, GEN,
            "", "", "", ">=", "1.0", "", ["A", "B"], ["A"],
        )


def test_open_cover_news_rejects_too_few_outcomes(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    with pytest.raises(Exception):
        open_news_cover(contract, direct_vm, direct_bob, allowed_outcomes=["ONLY_ONE"], triggering_outcomes=["ONLY_ONE"])


def test_open_cover_news_rejects_duplicate_outcomes(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    with pytest.raises(Exception):
        open_news_cover(contract, direct_vm, direct_bob, allowed_outcomes=["A", "a"], triggering_outcomes=["A"])


def test_open_cover_news_rejects_empty_triggering_outcomes(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    with pytest.raises(Exception):
        open_news_cover(contract, direct_vm, direct_bob, allowed_outcomes=["A", "B"], triggering_outcomes=[])


def test_open_cover_news_rejects_all_outcomes_as_triggering(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    with pytest.raises(Exception):
        open_news_cover(contract, direct_vm, direct_bob, allowed_outcomes=["A", "B"], triggering_outcomes=["A", "B"])


def test_open_cover_news_rejects_triggering_outcome_not_in_allowed(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    with pytest.raises(Exception):
        open_news_cover(contract, direct_vm, direct_bob, allowed_outcomes=["A", "B"], triggering_outcomes=["C"])


def test_open_cover_news_success(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_news_cover(contract, direct_vm, direct_bob)
    cover = contract.get_cover(cid)
    assert cover["allowed_outcomes"] == ["LAUNCH_DELAYED", "LAUNCH_ON_TIME"]
    assert cover["triggering_outcomes"] == ["LAUNCH_DELAYED"]


# --- check_claim: timing gates ---


def test_check_claim_rejects_unknown_cover(contract, direct_vm, direct_bob):
    with pytest.raises(Exception):
        contract.check_claim("CVR-999")


def test_check_claim_rejects_before_window_end(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_weather_cover(contract, direct_vm, direct_bob)
    warp_to(direct_vm, BEFORE_WINDOW_END)
    with pytest.raises(Exception):
        contract.check_claim(cid)


def test_check_claim_is_permissionless(contract, direct_vm, direct_bob, direct_charlie):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_weather_cover(contract, direct_vm, direct_bob)
    warp_to(direct_vm, AFTER_WINDOW_END)
    mock_weather(direct_vm, reading="50.0")
    direct_vm.sender = direct_charlie
    contract.check_claim(cid)
    assert contract.get_cover(cid)["resolved"] is True


def test_check_claim_rejects_second_call_once_resolved(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_weather_cover(contract, direct_vm, direct_bob)
    warp_to(direct_vm, AFTER_WINDOW_END)
    mock_weather(direct_vm, reading="50.0")
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    with pytest.raises(Exception):
        contract.check_claim(cid)


def test_check_claim_retry_blocked_before_cooldown_elapsed(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_weather_cover(contract, direct_vm, direct_bob)
    warp_to(direct_vm, AFTER_WINDOW_END)
    mock_weather(direct_vm, status="UNAVAILABLE")
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    with pytest.raises(Exception):
        contract.check_claim(cid)


def test_check_claim_retry_allowed_after_cooldown_elapsed(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_weather_cover(contract, direct_vm, direct_bob)
    warp_to(direct_vm, AFTER_WINDOW_END)
    mock_weather(direct_vm, status="UNAVAILABLE")
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    warp_to(direct_vm, AFTER_COOLDOWN)
    mock_weather(direct_vm, reading="50.0")
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    assert contract.get_cover(cid)["resolved"] is True


# --- check_claim: WEATHER numeric adapter ---


def test_check_claim_weather_triggers_when_reading_at_or_above_threshold(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_weather_cover(contract, direct_vm, direct_bob, coverage_amount=2 * GEN, threshold_value="40.0")
    warp_to(direct_vm, AFTER_WINDOW_END)
    nav_before = int(contract.get_pool_summary()["pool_nav"])
    mock_weather(direct_vm, reading="50.0")  # 50.0 >= 40.0
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    cover = contract.get_cover(cid)
    assert cover["resolution_status"] == "TRIGGERED"
    assert cover["payout_amount"] == str(2 * GEN)
    summary = contract.get_pool_summary()
    assert summary["reserved_liability"] == "0"
    # Pool NAV drops by at least the payout (plus the keeper reward).
    assert int(summary["pool_nav"]) <= nav_before - (2 * GEN)


def test_check_claim_weather_does_not_trigger_when_reading_below_threshold(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_weather_cover(contract, direct_vm, direct_bob, coverage_amount=2 * GEN, threshold_value="40.0")
    warp_to(direct_vm, AFTER_WINDOW_END)
    mock_weather(direct_vm, reading="10.0")  # 10.0 < 40.0
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    cover = contract.get_cover(cid)
    assert cover["resolution_status"] == "NOT_TRIGGERED"
    assert cover["payout_amount"] == "0"
    assert contract.get_pool_summary()["reserved_liability"] == "0"


def test_check_claim_weather_forces_insufficient_with_only_one_source_available(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_weather_cover(contract, direct_vm, direct_bob)
    warp_to(direct_vm, AFTER_WINDOW_END)
    direct_vm.clear_mocks()
    direct_vm.mock_web(
        r".*archive-api\.open-meteo\.com.*",
        {"status": 200, "body": '{"daily":{"precipitation_sum":[10.0,50.0,5.0]}}'},
    )
    # Google News deliberately left unmocked -- only 1 of 2 sources responds.
    direct_vm.mock_llm(
        r".*extracting a single numeric reading.*",
        '{"status":"FOUND","reading":"50.0","source_a_summary":"peak reading found",'
        '"source_b_summary":"","rationale":"looks clear"}',
    )
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    cover = contract.get_cover(cid)
    assert cover["resolution_status"] == "INSUFFICIENT_EVIDENCE"
    assert cover["resolved"] is False


def test_check_claim_weather_defensively_downgrades_malformed_reading(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_weather_cover(contract, direct_vm, direct_bob)
    warp_to(direct_vm, AFTER_WINDOW_END)
    mock_weather(direct_vm, status="FOUND", reading="not-a-number")
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    cover = contract.get_cover(cid)
    assert cover["resolution_status"] == "INSUFFICIENT_EVIDENCE"


def test_check_claim_weather_keeps_pool_solvent_after_payout(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_weather_cover(contract, direct_vm, direct_bob, coverage_amount=5 * GEN, threshold_value="40.0")
    warp_to(direct_vm, AFTER_WINDOW_END)
    mock_weather(direct_vm, reading="60.0")
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    summary = contract.get_pool_summary()
    assert int(summary["pool_nav"]) >= 0
    assert int(summary["total_shares"]) > 0  # LP shares untouched by a claim payout


# --- check_claim: PRICE_THRESHOLD numeric adapter ---


def test_check_claim_price_triggers_with_lte_comparator_when_price_drops(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_price_cover(contract, direct_vm, direct_bob, coverage_amount=2 * GEN, comparator="<=", threshold_value="40000.0")
    warp_to(direct_vm, AFTER_WINDOW_END)
    mock_price(direct_vm, reading="35000.0")  # 35000 <= 40000
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    assert contract.get_cover(cid)["resolution_status"] == "TRIGGERED"


def test_check_claim_price_does_not_trigger_with_lte_comparator_when_price_stays_above(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_price_cover(contract, direct_vm, direct_bob, coverage_amount=2 * GEN, comparator="<=", threshold_value="40000.0")
    warp_to(direct_vm, AFTER_WINDOW_END)
    mock_price(direct_vm, reading="45000.0")  # 45000 > 40000
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    assert contract.get_cover(cid)["resolution_status"] == "NOT_TRIGGERED"


def test_check_claim_price_triggers_with_gte_comparator_when_price_rises(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_price_cover(contract, direct_vm, direct_bob, coverage_amount=2 * GEN, comparator=">=", threshold_value="50000.0")
    warp_to(direct_vm, AFTER_WINDOW_END)
    mock_price(direct_vm, reading="55000.0")
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    assert contract.get_cover(cid)["resolution_status"] == "TRIGGERED"


# --- check_claim: NEWS_EVENT categorical adapter ---


def test_check_claim_news_triggers_when_outcome_in_triggering_set(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_news_cover(contract, direct_vm, direct_bob, coverage_amount=2 * GEN)
    warp_to(direct_vm, AFTER_WINDOW_END)
    mock_news_event(direct_vm, outcome="LAUNCH_DELAYED")
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    cover = contract.get_cover(cid)
    assert cover["resolution_status"] == "TRIGGERED"
    assert cover["extracted_reading"] == "LAUNCH_DELAYED"


def test_check_claim_news_does_not_trigger_when_outcome_not_in_triggering_set(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_news_cover(contract, direct_vm, direct_bob, coverage_amount=2 * GEN)
    warp_to(direct_vm, AFTER_WINDOW_END)
    mock_news_event(direct_vm, outcome="LAUNCH_ON_TIME")
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    assert contract.get_cover(cid)["resolution_status"] == "NOT_TRIGGERED"


def test_check_claim_news_defensively_downgrades_outcome_outside_allowed_set(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_news_cover(contract, direct_vm, direct_bob)
    warp_to(direct_vm, AFTER_WINDOW_END)
    mock_news_event(direct_vm, status="RESOLVED", outcome="SOMETHING_ELSE_ENTIRELY")
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    assert contract.get_cover(cid)["resolution_status"] == "INSUFFICIENT_EVIDENCE"


def test_check_claim_news_forces_insufficient_with_only_one_source_available(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_news_cover(contract, direct_vm, direct_bob)
    warp_to(direct_vm, AFTER_WINDOW_END)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*api\.github\.com.*", {"status": 200, "body": '{"items":[{"title":"related issue"}]}'})
    # Google News and Wikipedia deliberately left unmocked -- only 1 of 3 sources responds.
    direct_vm.mock_llm(
        r".*classifying a real-world event.*",
        '{"status":"RESOLVED","outcome":"LAUNCH_DELAYED","source_a_summary":"a",'
        '"source_b_summary":"","source_c_summary":"","rationale":"looks delayed"}',
    )
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    assert contract.get_cover(cid)["resolution_status"] == "INSUFFICIENT_EVIDENCE"


# --- keeper reward ---


def test_check_claim_pays_keeper_reward_from_pool_nav(contract, direct_vm, direct_bob, direct_charlie):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_weather_cover(contract, direct_vm, direct_bob, coverage_amount=2 * GEN, threshold_value="40.0")
    warp_to(direct_vm, AFTER_WINDOW_END)
    nav_before = int(contract.get_pool_summary()["pool_nav"])
    mock_weather(direct_vm, reading="10.0")  # not triggered -- isolates the keeper deduction
    direct_vm.sender = direct_charlie  # a third party, not the beneficiary, triggers the check
    contract.check_claim(cid)
    nav_after = int(contract.get_pool_summary()["pool_nav"])
    assert nav_before - nav_after == 1 * 10**15  # exactly KEEPER_REWARD_WEI, no payout occurred


# --- expire_unclaimed_cover ---


def test_expire_unclaimed_cover_rejects_before_grace_period(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_weather_cover(contract, direct_vm, direct_bob)
    warp_to(direct_vm, AFTER_WINDOW_END)
    mock_weather(direct_vm, status="UNAVAILABLE")
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    warp_to(direct_vm, JUST_BEFORE_EXPIRE_GRACE)
    with pytest.raises(Exception):
        contract.expire_unclaimed_cover(cid)


def test_expire_unclaimed_cover_succeeds_after_grace_period_and_releases_liability(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_weather_cover(contract, direct_vm, direct_bob, coverage_amount=3 * GEN)
    warp_to(direct_vm, AFTER_WINDOW_END)
    mock_weather(direct_vm, status="UNAVAILABLE")
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    warp_to(direct_vm, AFTER_EXPIRE_GRACE)
    direct_vm.sender = direct_bob
    contract.expire_unclaimed_cover(cid)
    cover = contract.get_cover(cid)
    assert cover["resolution_status"] == "EXPIRED_VOID"
    assert cover["resolved"] is True
    assert contract.get_pool_summary()["reserved_liability"] == "0"


def test_expire_unclaimed_cover_rejects_already_resolved(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    cid = open_weather_cover(contract, direct_vm, direct_bob)
    warp_to(direct_vm, AFTER_WINDOW_END)
    mock_weather(direct_vm, reading="50.0")
    direct_vm.sender = direct_bob
    contract.check_claim(cid)
    warp_to(direct_vm, AFTER_EXPIRE_GRACE)
    with pytest.raises(Exception):
        contract.expire_unclaimed_cover(cid)


# --- views ---


def test_list_peril_types_returns_seeded_defaults(contract, direct_vm):
    types = contract.list_peril_types()
    assert len(types) == 3


def test_list_covers_respects_offset_and_limit(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    open_weather_cover(contract, direct_vm, direct_bob, subject="First cover subject")
    open_weather_cover(contract, direct_vm, direct_bob, subject="Second cover subject")
    open_weather_cover(contract, direct_vm, direct_bob, subject="Third cover subject")
    page = contract.list_covers(1, 1)
    assert len(page) == 1
    assert page[0]["id"] == "CVR-2"


def test_list_covers_by_beneficiary_filters_correctly(contract, direct_vm, direct_bob, direct_charlie):
    fund_pool(contract, direct_vm, direct_bob, 100 * GEN)
    warp_to(direct_vm, NOW)
    open_weather_cover(contract, direct_vm, direct_bob, subject="Bob's first cover")
    open_weather_cover(contract, direct_vm, direct_charlie, subject="Charlie's only cover")
    open_weather_cover(contract, direct_vm, direct_bob, subject="Bob's second cover")
    bob_covers = contract.list_covers_by_beneficiary(direct_bob, 0, 10)
    assert len(bob_covers) == 2


def test_get_pool_summary_reports_consistent_state(contract, direct_vm, direct_bob):
    fund_pool(contract, direct_vm, direct_bob, 50 * GEN)
    warp_to(direct_vm, NOW)
    open_weather_cover(contract, direct_vm, direct_bob, coverage_amount=3 * GEN)
    summary = contract.get_pool_summary()
    assert summary["cover_count"] == 1
    assert summary["reserved_liability"] == str(3 * GEN)
    assert int(summary["pool_nav"]) > 50 * GEN  # premium collected
