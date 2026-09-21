#!/usr/bin/env bash
# Create the three founding-rate coupons and their promotion codes in Stripe.
#
#   export STRIPE_SECRET_KEY=sk_live_...      # your key, your terminal
#   bash founding-coupons.sh                  # shows what it would do, creates nothing
#   bash founding-coupons.sh --go             # actually creates them
#
# Coupons cannot be edited after creation — only deleted and remade — so read the dry run.
#
# Each coupon:
#   percent_off      chosen so the monthly price lands exactly on the founding rate. Percentage,
#                    not a fixed amount: applies_to works per PRODUCT, and each product has a
#                    monthly and a yearly price. A fixed A$8 off the A$250 yearly Artist Pro is
#                    A$242 — worse than the A$17/mo you promised. A percentage scales correctly.
#   duration         repeating, 24 months  → Stripe holds the price, then rolls them to full
#   applies_to       that plan's product   → an artist code can't be used on a label plan
#   max_redemptions  how many founding spots that tier has
#   redeem_by        the batch deadline (see REDEEM_BY below)
set -euo pipefail

: "${STRIPE_SECRET_KEY:?Set STRIPE_SECRET_KEY first (export STRIPE_SECRET_KEY=sk_live_...)}"

# One date for the whole batch. droplr shows each account its own claim date; this is the
# backstop in Stripe, so make it late enough to cover the last founder you expect to sign up.
REDEEM_BY_DATE="${REDEEM_BY_DATE:-2027-03-31}"
REDEEM_BY=$(date -j -f "%Y-%m-%d" "$REDEEM_BY_DATE" "+%s" 2>/dev/null || date -d "$REDEEM_BY_DATE" "+%s")

GO="${1:-}"
API="https://api.stripe.com/v1"

# name|coupon id|code|percent_off|product|max redemptions|monthly result
PLANS=(
  "Founding Artist Pro|founding-artistpro|FOUNDING-ARTISTPRO|32|prod_VH5jI4T6W4X2m9|10|A\$25→A\$17"
  "Founding Pro|founding-pro|FOUNDING-PRO|34.48|prod_VGf8U9gwLoobCj|3|A\$29→A\$19"
  "Founding Label|founding-label|FOUNDING-LABEL|30.38|prod_VGfCCaxVik8qS4|3|A\$79→A\$55"
)

echo "Stripe account:"
curl -s "$API/balance" -u "$STRIPE_SECRET_KEY:" -o /dev/null -w "  auth ok (HTTP %{http_code})\n" || {
  echo "  couldn't authenticate — check STRIPE_SECRET_KEY"; exit 1; }
case "$STRIPE_SECRET_KEY" in
  sk_live_*) echo "  MODE: LIVE — these are real coupons on real money" ;;
  *)         echo "  MODE: test" ;;
esac
echo "  redeem_by: $REDEEM_BY_DATE"
echo

for row in "${PLANS[@]}"; do
  IFS='|' read -r NAME ID CODE PCT PRODUCT MAXR RESULT <<<"$row"
  printf '%s\n' "$NAME"
  printf '  coupon %s: %s%% off (%s), repeating 24 months, product %s, max %s, code %s\n' \
    "$ID" "$PCT" "$RESULT" "$PRODUCT" "$MAXR" "$CODE"

  if [ "$GO" != "--go" ]; then continue; fi

  if curl -s "$API/coupons/$ID" -u "$STRIPE_SECRET_KEY:" | grep -q '"id"'; then
    echo "  → coupon already exists, skipping"
  else
    curl -s "$API/coupons" -u "$STRIPE_SECRET_KEY:" \
      -d id="$ID" \
      -d name="$NAME" \
      -d percent_off="$PCT" \
      -d duration=repeating \
      -d duration_in_months=24 \
      -d max_redemptions="$MAXR" \
      -d redeem_by="$REDEEM_BY" \
      -d "applies_to[products][0]=$PRODUCT" \
      -o /tmp/coupon.json -w "  → coupon HTTP %{http_code}\n"
    grep -o '"message": *"[^"]*"' /tmp/coupon.json || true
  fi

  if curl -s "$API/promotion_codes?code=$CODE&limit=1" -u "$STRIPE_SECRET_KEY:" | grep -q '"id": *"promo_'; then
    echo "  → promotion code already exists, skipping"
  else
    curl -s "$API/promotion_codes" -u "$STRIPE_SECRET_KEY:" \
      -d coupon="$ID" \
      -d code="$CODE" \
      -d max_redemptions="$MAXR" \
      -o /tmp/promo.json -w "  → promotion code HTTP %{http_code}\n"
    grep -o '"message": *"[^"]*"' /tmp/promo.json || true
  fi
  echo
done

if [ "$GO" != "--go" ]; then
  echo "Dry run. Nothing was created. Re-run with --go when the above looks right."
else
  echo "Done. Check them at https://dashboard.stripe.com/coupons"
  echo "Then in droplr /platform, the promo code dropdown already offers these names."
fi
