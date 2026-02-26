import { Link } from "react-router-dom";
import type { GameMeta } from "../app/gameRegistry";

type GameCardProps = {
  game: GameMeta;
};

export function GameCard({ game }: GameCardProps) {
  return (
    <article className="game-card">
      <div className="game-card-head">
        <h2>{game.title}</h2>
        <span className={`pill ${game.status}`}>{game.status}</span>
      </div>
      <p>{game.description}</p>
      <Link to={game.route} className="play-link">
        Open game
      </Link>
    </article>
  );
}
