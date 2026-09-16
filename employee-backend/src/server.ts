import { app } from "./app";
import { env } from "./config/env";
app.listen(env.PORT, () => console.log(`JANSEVA-X Employee Backend listening on port ${env.PORT}`));
