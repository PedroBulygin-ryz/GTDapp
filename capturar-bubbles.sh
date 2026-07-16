#!/bin/zsh

INBOX="$HOME/Documents/Bubbles/inbox.txt"
mkdir -p "$(dirname "$INBOX")"
touch "$INBOX"

CAPTURE=$(/usr/bin/osascript <<'APPLESCRIPT'
try
  set dialogResult to display dialog "Capturar en Bubbles:" default answer "" buttons {"Cancelar", "Guardar"} default button "Guardar" cancel button "Cancelar"
  return text returned of dialogResult
on error number -128
  return ""
end try
APPLESCRIPT
)

if [ -n "$CAPTURE" ]; then
  printf "%s | %s\n" "$(date '+%Y-%m-%d %H:%M')" "$CAPTURE" >> "$INBOX"
fi
