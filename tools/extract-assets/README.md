# Asset extraction

`assets/sounds` and `assets/textures` were extracted from a local League of Legends install. This tool regenerates them after a League patch changes the pings.

## Sounds

```bash
py -3.14 tools/extract-assets/extract_assets.py --league "C:/Riot Games/League of Legends" --vgmstream path/to/vgmstream-cli.exe
```

1. Reads `Game/DATA/FINAL/Maps/Shipping/Common.wad.client` (WAD v3; zstd entries; paths hashed with xxHash64).
2. Pulls `hud_global_events.bnk` (event graph) and `hud_global_audio.bnk` (embedded WEM media).
3. Follows each `Play_sfx_hud_base_Pings_*` event (FNV-1 32-bit id of the lower-cased name) → action → layer container → sounds.
4. Decodes Wwise Vorbis with vgmstream, then mixes multi-layer events with ffmpeg (`amix` + `alimiter` at −1 dB).

## Textures

Most textures were exported as DDS (DXT5) with Obsidian. To convert a folder of them:

```bash
py -3.14 tools/extract-assets/extract_assets.py --dds-dir path/to/dds
```

Bait and Vision Cleared are read straight from League's `.tex` files in `Global.wad.client` (see `WAD_TEXTURES` in the script). This needs Pillow installed for Python 3.14:

```bash
py -3.14 tools/extract-assets/extract_assets.py --league "C:/Riot Games/League of Legends" --wad-textures
```

No game file says which sound those two pings play: `SRP_11` (Bait) and `SRP_6` (Vision Cleared) were identified by listening. `SRP_13` is the structure-defend ping.

Never reference the colourblind (`*_cb*`) files in the app.
