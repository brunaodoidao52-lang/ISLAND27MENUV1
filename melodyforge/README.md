# 🎵 MelodyForge

> **Evolve Music Through AI**

> **📚 Documentation:** [START-HERE](START-HERE.md) • [QUICKSTART](QUICKSTART.md) • **README** • [FEATURES](FEATURES.md) • [PACKAGE](PACKAGE_CONTENTS.md)

MelodyForge is a cutting-edge web application that uses genetic algorithms to evolve unique musical compositions in real-time. Watch as melodies, harmonies, and rhythms naturally emerge through artificial selection, creating music that's both algorithmic and artistic.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](https://github.com/yourusername/melodyforge)
[![Status](https://img.shields.io/badge/status-stable-success.svg)](https://github.com/yourusername/melodyforge)

---

## ✨ Features

### 🧬 **Genetic Algorithm Engine**
- **20-genome population** with tournament selection
- **Multi-objective fitness** evaluation (melodic, harmonic, rhythmic)
- **Adaptive mutation rates** (1-50% adjustable)
- **Elitism preservation** (top 30% genomes)
- **Real-time evolution** with 3-second generations

### 🎼 **Professional Music Generation**
- **7 Musical Scales**: Major, Minor, Pentatonic, Blues, Dorian, Mixolydian, Harmonic Minor
- **Authentic Chord Progressions**: I-IV-V, I-vi-IV-V, and more
- **3-Layer Composition**: Melody, bass line, and chords
- **Voice Leading**: Smooth harmonic transitions
- **Dynamic Velocity**: Realistic note expression

### 🎛️ **Real-Time Controls**
- **Musical Parameters**: Complexity (1-10), Harmony density (1-10)
- **Audio Effects**: Reverb (0-100%), Tempo (60-180 BPM)
- **Fitness Focus**: Optimize for harmony, rhythm, or catchiness
- **Layer Mixing**: Toggle melody/bass/chords independently

### 🌍 **7 Musical Environments**
Each environment applies unique evolutionary pressures:

| Environment | Tempo | Characteristics |
|------------|-------|----------------|
| 🌊 **Ambient** | Slow (60-100 BPM) | Spacious, minimal, atmospheric |
| 💃 **Dance** | Fast (110-140 BPM) | Driving rhythm, high energy |
| 🎷 **Jazz** | Variable | Complex harmony, swing feel |
| 🎻 **Classical** | Moderate | Traditional forms, voice leading |
| 🎧 **Lo-Fi** | Mid (70-95 BPM) | Chill, relaxed, nostalgic |
| ⚡ **Electronic** | Fast (120-180 BPM) | Syncopated, bass-heavy |
| 🔬 **Experimental** | Any | Rewards extremes and novelty |

### 🔊 **Studio-Quality Audio**
- **Web Audio API** powered synthesis
- **Professional Effects Chain**:
  - Reverb (2.5s decay)
  - Delay (250ms with feedback)
  - Chorus (on chords)
  - Low-pass filter (on bass)
- **Three Synthesizers**:
  - Triangle wave melody synth
  - Sawtooth bass synth
  - Sine wave chord synth

### 📊 **Advanced Visualization**
- **Dual Visualizers**: 20-bar frequency display + real-time waveform
- **Fitness Breakdown**: Live display of melodic, harmonic, and rhythmic scores
- **Evolution Progress**: Track generation and population diversity
- **Musical DNA Display**: Current scale, tempo, and pattern info

### 💾 **Save & Share**
- **Genome Library**: Save unlimited compositions to localStorage
- **Custom Naming**: Organize your favorite evolutions
- **Export System**: Download genomes as JSON
- **MIDI Export**: Text-based MIDI data with full notation

---

## 🚀 Quick Start

### **Option 1: Run Locally**
```bash
# Clone the repository
git clone https://github.com/yourusername/melodyforge.git
cd melodyforge

# Open in browser
open melodyforge-ultimate.html
# or
python -m http.server 8000
# Then visit http://localhost:8000
```

### **Option 2: Online**
Simply open the HTML file in any modern browser - no installation required!

---

## 📖 How to Use

### **Basic Workflow**

1. **🔊 Enable Audio**
   - Click anywhere on the page to activate Web Audio API
   - Wait for "Audio enabled!" notification

2. **▶️ Play Music**
   - Press the play button to hear the current genome
   - Watch the visualizers respond to the audio

3. **🧬 Start Evolution**
   - Click "Start Evolution" to begin the genetic algorithm
   - New generations appear every 3 seconds

4. **👍👎 Guide Evolution**
   - Click "Like" to increase fitness of current genome
   - Click "Skip" to decrease fitness and try alternatives

5. **💾 Save Favorites**
   - Name your genome and click "Save"
   - Access saved genomes from the library panel

6. **🎼 Export**
   - Export MIDI data as text file
   - Export entire genome library as JSON

### **Advanced Techniques**

#### **Directed Evolution**
```
1. Select environment (e.g., "Jazz")
2. Set fitness focus (e.g., "Harmony")
3. Adjust mutation rate low (5-10%)
4. Evolve for 20+ generations
5. Fine-tune with Like/Skip
```

#### **Exploration Mode**
```
1. Select "Experimental" environment
2. Max out mutation rate (40-50%)
3. Increase complexity (8-10)
4. Let it run for surprising results
```

#### **Layer Mixing**
```
1. Toggle individual layers on/off
2. Solo bass line to study harmony
3. Mute melody to hear chord progressions
4. Create your own arrangements
```

---

## 🎓 Understanding the Science

### **Genetic Algorithm**

MelodyForge uses a standard genetic algorithm with musical-specific adaptations:

```
┌─────────────────────────────────────┐
│  1. INITIALIZATION                  │
│     Create 20 random genomes        │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│  2. EVALUATION                      │
│     Calculate fitness for each      │
│     - Melodic Interest (35%)        │
│     - Harmonic Consonance (35%)     │
│     - Rhythmic Stability (30%)      │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│  3. SELECTION                       │
│     Tournament selection (size 4)   │
│     Keep top 30% (elitism)          │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│  4. CROSSOVER                       │
│     Multi-point crossover of traits │
│     Blend two parents               │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│  5. MUTATION                        │
│     Gaussian mutation per trait     │
│     Rate: 1-50% (adjustable)        │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│  6. REPLACEMENT                     │
│     New generation created          │
│     Repeat from step 2              │
└─────────────────────────────────────┘
```

### **Fitness Functions**

#### **Melodic Interest** (0-1 score)
```javascript
// Evaluates:
- Contour variety (ascending/descending balance)
- Interval diversity (step size variation)
- Motif repetition (memorable vs. chaotic)
- Shape aesthetics (smooth curves preferred)
```

#### **Harmonic Consonance** (0-1 score)
```javascript
// Evaluates:
- Scale quality (major/pentatonic score higher)
- Complexity balance (moderate harmony preferred)
- Voice leading (smooth chord transitions)
- Bass movement (appropriate root progression)
```

#### **Rhythmic Stability** (0-1 score)
```javascript
// Evaluates:
- Tempo appropriateness (70-150 BPM sweet spot)
- Density balance (moderate note density)
- Syncopation interest (some but not excessive)
- Swing factor (adds groove)
```

### **Genome Structure**

Each genome contains 16 musical traits:

```javascript
{
  musicalTraits: {
    // Scale & Pitch
    scaleType: 'major' | 'minor' | 'dorian' | ...,
    rootNote: 0-11,  // C to B
    
    // Melody
    melodyShape: 0-1,        // Overall contour
    melodyInterval: 0-1,     // Jump size
    melodicContour: 0-1,     // Up/down tendency
    motifRepetition: 0-1,    // Repetition amount
    
    // Rhythm
    tempo: 60-180,           // BPM
    rhythmDensity: 0-1,      // Note frequency
    syncopation: 0-1,        // Off-beat emphasis
    swingFactor: 0-1,        // Groove amount
    
    // Harmony
    harmonyComplexity: 0-1,  // Extension usage
    chordProgression: [0,3,4,0],  // Degree sequence
    bassMovement: 0-1,       // Bass activity
    voiceLeading: 0-1,       // Smoothness
    
    // Expression
    articulation: 0-1,       // Note separation
    dynamics: 0-1,           // Volume variation
    tension: 0-1             // Dissonance amount
  },
  fitness: 0-1,
  age: 0
}
```

---

## 🛠️ Technical Details

### **Technology Stack**

| Component | Technology | Version |
|-----------|-----------|---------|
| Audio Engine | Tone.js | 14.8.49 |
| Audio API | Web Audio API | Native |
| Language | JavaScript | ES6+ |
| Storage | localStorage | Native |
| Visualization | Canvas API | Native |

### **Performance Specs**

- **Animation**: 60 FPS
- **Audio Latency**: ~20ms
- **Evolution Speed**: 3s per generation
- **Polyphony**: 32 simultaneous voices
- **Sample Rate**: 44.1kHz (browser default)

### **Browser Support**

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 90+ | ✅ Full Support |
| Firefox | 88+ | ✅ Full Support |
| Safari | 14+ | ✅ Full Support |
| Edge | 90+ | ✅ Full Support |
| Opera | 76+ | ✅ Full Support |

**Requirements**:
- Web Audio API support
- localStorage enabled
- JavaScript enabled

---

## 💡 Tips & Best Practices

### **Getting Great Results**

1. **Start Simple**
   - Begin with Ambient environment
   - Use low complexity (3-5)
   - Modest mutation rate (10-15%)

2. **Evolve Gradually**
   - Let it run for 10-20 generations
   - Don't force evolution too quickly
   - Trust the process

3. **Use Environments Wisely**
   - Match environment to desired style
   - Switch environments to explore variations
   - Experimental mode for happy accidents

4. **Layer Mixing**
   - Solo layers to understand composition
   - Create minimal versions (melody only)
   - Build up complexity gradually

5. **Save Often**
   - Save good genomes immediately
   - Name them descriptively
   - Build a library of starting points

### **Common Pitfalls**

❌ **High mutation rate + short evolution time**
- Results in chaos and instability
- Solution: Lower mutation or evolve longer

❌ **Never using Like/Skip**
- Evolution lacks direction
- Solution: Actively guide the process

❌ **Ignoring environment settings**
- Results don't match expectations
- Solution: Choose appropriate environment

❌ **Not saving good results**
- Lose interesting genomes forever
- Solution: Save liberally, delete later

---

## 🎯 Use Cases

### **Music Production**
- Generate melodic ideas for songwriting
- Create background music for videos
- Develop unique sound palettes
- Export MIDI for DAW integration

### **Education**
- Teach genetic algorithms interactively
- Demonstrate music theory concepts
- Explore evolutionary computation
- Study emergent behavior

### **Research**
- Algorithmic composition experiments
- Fitness function development
- Multi-objective optimization
- User interaction studies

### **Entertainment**
- Interactive audio experiences
- Generative art installations
- Live performance tools
- Procedural game music

---

## 🐛 Troubleshooting

### **Audio Not Playing**

**Problem**: No sound after clicking play
**Solution**: 
1. Check browser audio permissions
2. Ensure system volume is up
3. Try clicking anywhere on page first
4. Refresh the page and try again

### **Evolution Seems Stuck**

**Problem**: Fitness not improving
**Solution**:
1. Increase mutation rate (20-30%)
2. Try different environment
3. Use Skip button to reject poor genomes
4. Reset and start fresh

### **Genomes Not Saving**

**Problem**: Saved genomes disappear
**Solution**:
1. Check localStorage is enabled
2. Clear browser cache if full
3. Export genomes as JSON backup
4. Check private browsing mode is off

### **Slow Performance**

**Problem**: Lag or stuttering
**Solution**:
1. Close other browser tabs
2. Reduce visualizer complexity
3. Lower waveform sample rate
4. Disable unnecessary effects

---

## 📜 License

MIT License

Copyright (c) 2025 MelodyForge

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## 🙏 Acknowledgments

### **Technologies**
- [Tone.js](https://tonejs.github.io/) - Web Audio framework
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) - Browser audio engine

### **Inspiration**
- Karl Sims' "Evolved Virtual Creatures"
- David Cope's "Experiments in Musical Intelligence"
- Interactive Genetic Art by Scott Draves

### **Music Theory**
- "The Study of Counterpoint" by Johann Joseph Fux
- "Harmony" by Walter Piston
- "The Jazz Theory Book" by Mark Levine

---

## 🗺️ Roadmap

### **Version 1.1** (Q2 2025)
- [ ] Real MIDI file export (.mid format)
- [ ] Additional instruments (drums, pads, lead)
- [ ] Sheet music notation display
- [ ] Genome sharing via URL

### **Version 1.2** (Q3 2025)
- [ ] Cloud genome library
- [ ] Collaborative evolution
- [ ] Machine learning fitness
- [ ] Audio recording (.wav export)

### **Version 2.0** (Q4 2025)
- [ ] VST plugin version
- [ ] Mobile app (iOS/Android)
- [ ] Advanced AI features
- [ ] Commercial licensing

---

## ⭐ Show Your Support

If you find MelodyForge useful, please consider:

- ⭐ **Starring** this repository
- 🐛 **Reporting** bugs and issues
- 💡 **Suggesting** new features
- 🤝 **Contributing** code
- 📢 **Sharing** with others

---

<div align="center">

**🎵 MelodyForge - Forge Your Sound 🎵**

Made with ❤️ using Genetic Algorithms & Web Audio

</div>
