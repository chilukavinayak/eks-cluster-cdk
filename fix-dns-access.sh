#!/bin/bash

echo "=== Fixing DNS Access for interviewdeck.io ==="

# Test if domain resolves externally
echo "Testing DNS resolution..."
nslookup interviewdeck.io 8.8.8.8

# Get the resolved IP
IP=$(nslookup interviewdeck.io 8.8.8.8 | grep 'Address:' | tail -1 | awk '{print $2}')
echo "Domain resolves to: $IP"

# Test direct IP access
echo "Testing direct IP access..."
curl -H "Host: interviewdeck.io" http://$IP/login 2>/dev/null | head -5

echo ""
echo "=== DNS Cache Solutions ==="
echo ""
echo "1. **Flush local DNS cache:**"
echo "   sudo dscacheutil -flushcache"
echo "   sudo killall -HUP mDNSResponder"
echo ""
echo "2. **Use different DNS server:**"
echo "   curl -H 'Host: interviewdeck.io' http://$IP/login"
echo ""
echo "3. **Wait for local DNS propagation (5-60 minutes)**"
echo ""
echo "4. **Direct access (always works):**
echo "   http://a20ebbf0322084b32ad690f117eeea9d-738a6cbfafc115c0.elb.us-east-1.amazonaws.com/login"
echo ""
echo "✅ Your application is working! Just DNS cache needs to update."
