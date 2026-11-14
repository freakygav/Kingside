
# ♟️ Kingside

<p align="center">
  <strong>Your all-in-one chess training and analysis platform.</strong>
  <br />
  Play, learn, analyze, and improve — all in one desktop application.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Chess%20Engine-Stockfish-222222?style=for-the-badge" alt="Stockfish" />
  <img src="https://img.shields.io/badge/Game%20Format-PGN%20%7C%20FEN-6C5CE7?style=for-the-badge" alt="PGN and FEN" />
</p>

---

## ♟️ About Kingside

**Kingside** is a modern desktop chess application designed to bring everything a chess player needs into one place.

Whether you're learning the fundamentals, practicing tactics, playing against an engine, or reviewing competitive games, Kingside provides tools to help you understand chess and improve your decision-making.

Instead of switching between multiple websites and applications, Kingside combines chess gameplay, interactive lessons, puzzles, AI coaching, and detailed Stockfish analysis into one experience.

## ✨ Features

### ♟️ Play Against Stockfish

Play complete chess games against Stockfish with adjustable difficulty levels.

- Multiple difficulty settings based on approximate Elo ratings.
- Fully legal chess rules and move validation.
- 10-minute clocks for both players.
- Drag-and-drop and click-to-move controls.
- Premove support.
- Legal move indicators.
- Last-move highlighting.
- Right-click square annotations and arrows.
- Move history with historical position navigation.
- Human-like engine response timing.

Stockfish difficulty ratings are estimates and do not guarantee equivalence to an official chess rating.

### 📚 Interactive Chess Lessons

Learn chess through structured, interactive lessons designed for different skill levels.

**Beginner**
- Chess fundamentals and piece movement.
- Opening principles.
- Basic tactics.
- Checkmate patterns.
- King safety and development.

**Intermediate**
- Forks, pins, and skewers.
- Discovered attacks.
- Tactical combinations.
- Pawn structures.
- Endgame fundamentals.

**Advanced**
- Positional sacrifices.
- Zugzwang and opposition.
- Advanced endgame techniques.
- Prophylaxis.
- Complex positional concepts.

Lessons can include interactive chessboards, move demonstrations, explanations, and knowledge checks.

Track your learning progress and revisit completed lessons.

### 🧩 Chess Puzzles

Improve your tactical awareness with an interactive puzzle system.

Puzzle categories include:

- Mate in 1, 2, and 3.
- Winning material.
- Tactical combinations.
- Forks and pins.
- Skewers.
- Discovered attacks.
- Defensive tactics.
- Endgame puzzles.

Additional features:

- Adjustable puzzle difficulty.
- Puzzle rating system.
- Interactive move validation.
- Hints and explanations.
- Puzzle streak tracking.
- Accuracy statistics.
- Solving-time statistics.
- Progress tracking.

### 🧠 Six Elo-Based AI Chess Coaches

Choose from six coaching levels, each designed to explain chess concepts according to your playing strength.

| Coach | Approximate Elo |
|---|---:|
| Beginner Coach | 400–800 |
| Developing Coach | 800–1200 |
| Intermediate Coach | 1200–1600 |
| Advanced Coach | 1600–2000 |
| Expert Coach | 2000–2400 |
| Master Coach | 2400+ |

Each coach adapts its explanations, terminology, and level of detail.

Coaching features include:

- Position analysis.
- Move explanations.
- Candidate move suggestions.
- Tactical explanations.
- Opening analysis.
- Endgame guidance.
- Personalized improvement recommendations.
- Game review and performance feedback.

The coaches use chess engine analysis to ground their recommendations in actual positions rather than inventing evaluations or variations.

### 📊 Advanced Game Analysis

Review completed games with detailed Stockfish analysis.

Move classifications can include:

- Brilliant moves.
- Great moves.
- Best moves.
- Good moves.
- Inaccuracies.
- Mistakes.
- Blunders.
- Missed opportunities.

Additional analysis features:

- Interactive evaluation graph.
- Move-by-move analysis.
- Engine principal variations.
- Opening identification.
- Evaluation changes.
- Suggested engine continuations.
- Navigable historical positions.

Move classifications are based on the application's analysis criteria and should be treated as training indicators rather than universal judgments.

### 🌐 Chess.com & Lichess Game Imports

Import existing chess games and review them directly inside Kingside.

Supported import methods:

- Chess.com public game archives.
- Lichess public game history.
- PGN file imports.
- Pasted PGN notation.
- Multiple games from a single PGN file.

Imported games can be stored in a personal game library.

Review games with Stockfish, inspect individual moves, and use AI coaches to identify areas for improvement.

### 🎨 Chessboard Customization

Personalize the appearance of your chessboard and playing environment.

Customization options include:

- Multiple background styles.
- Solid-color backgrounds.
- Gradient backgrounds.
- Textured backgrounds.
- Custom uploaded background images.
- Custom light and dark square colors.
- Multiple chess piece themes.
- Background opacity and blur.
- Custom appearance presets.

Save your favorite combinations and use them throughout the application.

### 🏆 Progress & Achievements

Track your chess improvement through a unified training profile.

Statistics can include:

- Estimated playing Elo.
- Puzzle rating.
- Games played.
- Win/loss/draw records.
- Lessons completed.
- Puzzles solved.
- Puzzle accuracy.
- Total XP.
- Learning streaks.
- Achievements.
- Training history.

Playing strength, puzzle rating, and lesson progression are tracked separately.

---

## 🖥️ Platform

| Component | Support |
|---|---|
| Operating System | Windows |
| Application Type | Desktop Application |
| Chess Engine | Stockfish |
| Game Formats | PGN / FEN |
| Game Platforms | Chess.com / Lichess |
| Data Storage | Local persistence |

---

## 🚀 Installation

### Windows

1. Visit the [Kingside Releases](https://github.com/freakygav/Kingside/releases) page.
2. Download the latest available Windows release.
3. Extract the application if distributed in an archive.
4. Launch the executable.
5. Configure Stockfish if it is not already included.

Stockfish availability depends on the application's distribution configuration. Follow the included engine setup instructions if a separate engine binary is required.

---

## 🛠️ Building From Source

To build Kingside yourself:

**1. Clone the repository**

```bash
git clone https://github.com/freakygav/Kingside.git
```

**2. Navigate into the project directory**

```bash
cd Kingside
```

**3. Install project dependencies**

Follow the dependency installation instructions for the project.

**4. Configure Stockfish**

Make sure the Stockfish engine dependency is available and configured correctly.

**5. Start the application**

Use the development commands provided by the project.

**6. Build the Windows executable**

Follow the project's Windows packaging instructions to generate the application executable.

Refer to the project configuration and build scripts for the exact commands and requirements.

---

## 📁 Data & Privacy

Kingside is designed around locally stored game and training data.

Depending on the configured features, locally stored information may include:

- Imported chess games.
- Game analysis results.
- Lesson completion.
- Puzzle history.
- Coaching preferences.
- Appearance settings.
- Training statistics.
- Achievements.

External game imports use publicly accessible platform data where supported.

Chess.com and Lichess account passwords are not required for importing public games.

---

## ⚙️ Chess Engine

Kingside uses [Stockfish](https://stockfishchess.org/), a powerful open-source chess engine.

Stockfish provides the underlying chess analysis for:

- Gameplay.
- Position evaluation.
- Move recommendations.
- Game reviews.
- Tactical analysis.
- Engine variations.

Stockfish is distributed under the GNU General Public License (GPL). Any bundled engine binaries and corresponding distribution materials must comply with its licensing requirements.

---

## 🎯 Project Goals

The goal of Kingside is to bring the most useful chess training and analysis tools together in one desktop application.

Instead of switching between multiple websites and applications, players can:

1. Play against a configurable chess engine.
2. Learn through interactive lessons.
3. Improve through tactical puzzles.
4. Receive personalized coaching.
5. Import games from external chess platforms.
6. Analyze every move.
7. Customize their playing environment.
8. Track their long-term improvement.

Everything is designed to work together as one cohesive chess experience.

---

## 🤝 Contributing

Suggestions, bug reports, and improvements are welcome.

If you encounter an issue or have an idea for a new feature, feel free to open an issue in the repository.

When reporting bugs, include:

- A description of the problem.
- Steps to reproduce it.
- Expected behavior.
- Actual behavior.
- Relevant error messages or screenshots.

---

## 📜 License

This project and its dependencies may have different licensing requirements.

See the repository's license files and individual dependency licenses for details.

Stockfish is a separate open-source project distributed under the GPL.

---

<p align="center">
  <strong>♟️ Kingside</strong>
  <br />
  Built for chess players who want to play better, understand more, and keep improving.
  <br /><br />
  <a href="https://github.com/freakygav/Kingside">GitHub Repository</a>
</p>
