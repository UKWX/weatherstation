import { app } from './app';
import { config } from './config';
import './db/connection';
import './db/migrate';
import { startScheduler } from './jobs/scheduler';

startScheduler();

app.listen(config.port, () => {
  console.log(`WakefieldStation backend listening on port ${config.port}`);
});
