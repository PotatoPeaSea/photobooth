#!/bin/bash
# Create a CUPS queue for every Canon SELPHY on USB that doesn't have one yet.
# Run as root at boot and from udev (via photobooth-add-printers.service) when a Canon is plugged in.
# The print server runs with PRINTER_NAME=auto and alternates between these queues.
log() { echo "photobooth-add-printers: $*"; }
sleep 3   # let CUPS enumerate the new USB device

existing=$(lpstat -v 2>/dev/null)
lpinfo -v 2>/dev/null | awk '{print $2}' | while read -r uri; do
  # gutenprint53+usb://canon-cp910/ZR15090900005414
  [[ "$uri" =~ ^gutenprint[0-9]*\+usb://canon-(cp[0-9]+)/([^/?#]+)$ ]] || continue
  model=${BASH_REMATCH[1]}
  serial=${BASH_REMATCH[2]}
  grep -qF "$serial" <<<"$existing" && continue
  name="Selphy${model#cp}-${serial: -4}"
  log "adding $name ($uri)"
  lpadmin -p "$name" -E -v "$uri" -m "gutenprint.5.3://canon-$model/expert" \
    -o StpBorderless=True -o PageSize=Postcard 2>&1 || { log "lpadmin failed for $name"; continue; }
  cupsenable "$name"; cupsaccept "$name"
done

# A queue CUPS paused after a fault stays paused once the printer is back; resume the ones that are plugged in.
for name in $(lpstat -p 2>/dev/null | awk '/disabled/ {print $2}'); do
  uri=$(lpstat -v "$name" 2>/dev/null | awk '{print $NF}')
  serial=${uri##*/}
  lpinfo -v 2>/dev/null | grep -qF "$serial" && { log "resuming $name"; cupsenable "$name"; cupsaccept "$name"; }
done
exit 0
