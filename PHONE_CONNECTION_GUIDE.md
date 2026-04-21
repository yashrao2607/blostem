# Phone Connection Guide (ELI / ELI)

This guide explains exactly how to connect your Android phone to the app's **Phone** module.

The app uses **ADB (Android Debug Bridge)** under the hood.  
If ADB is not installed or not in PATH, connection will fail.

## 1) Prerequisites

- Windows PC and Android phone on the same Wi-Fi network (for wireless mode).
- Android phone with:
  - `Developer options` enabled
  - `USB debugging` enabled
- `adb` installed and available in terminal.

### Verify ADB on Windows

Open PowerShell:

```powershell
adb version
```

If this command fails, install Android Platform Tools and add its folder to PATH.

## 2) Enable Developer Options on Android

1. Open `Settings > About phone`.
2. Tap `Build number` 7 times.
3. Go back to `Settings > Developer options`.
4. Turn ON:
   - `USB debugging`
   - `Wireless debugging` (if available on your Android version)

## 3) Connection Method A (Most Reliable): USB first, then Wi-Fi

Use this method first. It is the quickest and most stable setup.

### Step A1: Authorize the device over USB

1. Connect phone with USB cable.
2. Run:

```powershell
adb devices
```

3. On phone, accept the prompt:
   - `Allow USB debugging`
   - Optional: check `Always allow from this computer`

4. Confirm your device appears as `device` (not `unauthorized`).

### Step A2: Switch ADB to TCP mode

```powershell
adb tcpip 5555
```

### Step A3: Find phone IP

On phone:
- `Settings > Wi-Fi > current network > IP address`

Example: `192.168.1.120`

### Step A4: Connect wirelessly from PC

```powershell
adb connect 192.168.1.120:5555
```

Optional verification:

```powershell
adb devices
```

You should see `192.168.1.120:5555` in the list.

## 4) Connection Method B (Android 11+): Wireless Debugging Pairing

Use this if TCP `5555` is blocked by your device/ROM.

1. On phone: `Developer options > Wireless debugging`.
2. Tap `Pair device with pairing code`.
3. Phone shows:
   - IP + pairing port (example `192.168.1.120:37123`)
   - Pairing code
4. On PC, run:

```powershell
adb pair 192.168.1.120:37123
```

5. Enter pairing code.
6. Then connect using the **debug port** shown in wireless debugging page:

```powershell
adb connect 192.168.1.120:xxxxx
```

(`xxxxx` is the connect/debug port from phone, not always 5555.)

## 5) Connect inside the app

Open app -> `Phone` tab.

You will see either:
- `Device Archive` (history of previous devices), or
- `Manual Connect` form.

### Manual Connect

1. Enter:
   - `IP` = phone IP
   - `Port` = `5555` (or wireless debug port if using Method B)
2. Click `Connect Securely`.

If successful:
- Status becomes connected
- Live screen stream appears
- Telemetry updates (battery/storage/network)

## 6) Quick validation after connecting

Inside the Phone view, try quick actions:
- `Home`
- `Wake`
- `Lock`
- `Camera`

If these work, connection is healthy.

## 7) Troubleshooting

### Device not found / offline

- Keep phone unlocked.
- Reconnect USB once and run:

```powershell
adb devices
adb tcpip 5555
adb connect <PHONE_IP>:5555
```

- Ensure both devices are on the same Wi-Fi.

### Unauthorized device

- Revoke USB debugging authorizations on phone:
  - `Developer options > Revoke USB debugging authorizations`
- Reconnect USB and accept prompt again.

### `adb` command not recognized

- Platform Tools is missing from PATH.
- Add platform-tools folder to Windows PATH, then restart terminal.

### Connection drops after restart

- Some devices reset TCP mode on reboot.
- Repeat:

```powershell
adb tcpip 5555
adb connect <PHONE_IP>:5555
```

### Port 5555 fails

- Use Method B (Wireless debugging pairing) and use the debug port shown by Android.

### App says "Device offline. Is Wi-Fi on and screen unlocked?"

- Confirm command-line ADB connection works first:

```powershell
adb connect <PHONE_IP>:<PORT>
adb devices
```

Only then connect in app.

## 8) Useful commands

```powershell
adb devices
adb kill-server
adb start-server
adb disconnect
adb disconnect <PHONE_IP>:<PORT>
adb connect <PHONE_IP>:<PORT>
```

## 9) Security notes

- Only connect to your own trusted phone.
- Do not leave wireless debugging enabled permanently on public networks.
- Disable wireless debugging when not in use.

