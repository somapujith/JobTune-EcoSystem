import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import App from './App.jsx';
import { buildHeadTags } from './config/renderStrategy.js';
import { resetStoresForSsr } from './store/ssrReset.js';

export function render(url) {
  resetStoresForSsr();

  const html = renderToString(
    <StaticRouter location={url}>
      <App />
    </StaticRouter>
  );

  const head = buildHeadTags(url);

  return { html, head };
}

export {
  getRenderStrategy,
  normalizePathname,
  buildHeadTags,
} from './config/renderStrategy.js';
