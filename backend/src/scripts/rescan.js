import { scan } from "../services/catalog.js";
import { logger } from "../logger.js";

/** Re-reads the movies folder and re-fetches TMDB metadata from scratch. */
const state = await scan({ force: true });
logger.info(state, "rescan.done");
process.exit(0);
