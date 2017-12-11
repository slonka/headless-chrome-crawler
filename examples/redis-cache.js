const HCCrawler = require('headless-chrome-crawler');
const RedisCache = require('headless-chrome-crawler/cache/redis');

function launch(persistCache) {
  return HCCrawler.launch({
    maxConcurrency: 1,
    maxRequest: 2,
    evaluatePage: (() => ({
      title: $('title').text(),
      h1: $('h1').text(),
    })),
    onSuccess: (result => {
      console.log('onSuccess', result);
    }),
    cache: new RedisCache(), // Passing no options expects Redis to be run in the local machine.
    persistCache, // Cache won't be cleared when closing the crawler if set true
  });
}

launch(true) // Launch the crawler with persisting cache
  .then(crawler => {
    crawler.queue('https://example.com/');
    crawler.queue('https://example.net/');
    crawler.queue('https://example.org/'); // The queue won't be requested due to maxRequest option
    return crawler.onIdle()
      .then(() => crawler.close()); // Close the crawler but cache won't be cleared
  })
  .then(() => launch(false)) // Launch the crawler again without persisting cache
  .then(crawler => {
    crawler.queue('https://example.net/'); // This queue won't be requested because cache remains
    crawler.queue('https://example.org/');
    return crawler.onIdle()
      .then(() => crawler.close());
  });
