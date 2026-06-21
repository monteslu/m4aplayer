# M4A Stem Player

A web-based audio player for M4A stem files with waveform visualization and per-track muting.

**[Live Demo](https://stemsplayer.netlify.app/)**

## Features

- Load and play M4A stem files (multi-track) or regular M4A files (single track)
- Visual waveform display for each track
- Independent mute control for each stem (Drums, Bass, Other, Vocals, Master)
- Click-to-seek on any waveform
- Synchronized playback of all tracks using Web Audio API
- Works entirely in the browser - no server-side processing

## Stem Track Layout

For 5-track stem files (NI Stems compatible):
- 🥁 **Drums** - Percussion and rhythm
- 🎸 **Bass** - Bass and low-end
- 🎹 **Other** - Melody, synths, instruments
- 🎤 **Vocals** - Vocal tracks
- 🎵 **Master** - Full mixdown (muted by default to avoid doubling)

Regular M4A files display as a single 🎵 Audio track.

## Usage

1. Click "Open File" to load an M4A file
2. Use the transport controls to play, pause, or stop
3. Click the 🔊/🔇 buttons to mute/unmute individual tracks
4. Click anywhere on a waveform to seek to that position

## Development

```bash
npm install
npm run dev
```

## Dependencies

- [stem-mp4](https://github.com/monteslu/stem-mp4) - Stem MP4 file extraction (FFmpeg-free)
- React + Vite
- Web Audio API for playback
