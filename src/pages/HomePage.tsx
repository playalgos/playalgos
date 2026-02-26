import { games } from "../app/gameRegistry";
import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <section>
      <h1>Games</h1>
      <p className="subtitle">Algorithm Arcade list. Pick a game and keep climbing the leaderboard.</p>
      <ol className="game-feed">
        {games.map((game, index) => (
          <li key={game.id} className="game-feed-item">
            <span className="game-rank">{index + 1}.</span>
            <div className="game-main">
              <Link to={game.route} className="game-title-link">
                {game.title}
              </Link>
              <p className="game-summary">{game.description}</p>
              <div className="game-meta">
                <span>status: {game.status}</span>
                <span>id: {game.id}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
