const { unlink, readFile } = require('fs');
const assert = require('assert');
const sinon = require('sinon');
const HCCrawler = require('../');
const RedisCache = require('../cache/redis');
const CSVExporter = require('../exporter/csv');
const JSONLineExporter = require('../exporter/json-line');
const Crawler = require('../lib/crawler');

const URL1 = 'http://www.example.com/';
const URL2 = 'http://www.example.net/';
const URL3 = 'http://www.example.org/';
const CSV_FILE = './tmp/result.csv';
const JSON_FILE = './tmp/result.json';
const ENCODING = 'utf8';

describe('HCCrawler', () => {
  let crawler;

  afterEach(() => {
    Crawler.prototype.crawl.restore();
  });

  context('when crawling does not fails', () => {
    beforeEach(() => {
      sinon.stub(Crawler.prototype, 'crawl').returns(Promise.resolve({
        options: {},
        result: { title: 'Example Domain' },
        links: ['http://www.iana.org/domains/example'],
        screenshot: null,
      }));
    });

    context('when the crawler is launched without necessary options', () => {
      beforeEach(() => (
        HCCrawler.launch()
          .then(_crawler => {
            crawler = _crawler;
          })
      ));

      afterEach(() => crawler.close());

      it('throws an error when queueing null', () => {
        assert.throws(() => {
          crawler.queue(null);
        });
      });

      it('throws an error when queueing options without URL', () => {
        assert.throws(() => {
          crawler.queue();
        });
      });

      it('crawls when queueing necessary options', () => {
        assert.doesNotThrow(() => {
          crawler.queue({ url: URL1 });
        });
        return crawler.onIdle()
          .then(() => {
            assert.equal(Crawler.prototype.crawl.callCount, 1);
          });
      });
    });

    context('when the crawler is launched with necessary options', () => {
      beforeEach(() => (
        HCCrawler.launch()
          .then(_crawler => {
            crawler = _crawler;
          })
      ));

      afterEach(() => crawler.close());

      it('crawls when queueing a string', () => {
        assert.doesNotThrow(() => {
          crawler.queue(URL1);
        });
        return crawler.onIdle()
          .then(() => {
            assert.equal(Crawler.prototype.crawl.callCount, 1);
          });
      });

      it('crawls when queueing multiple strings', () => {
        assert.doesNotThrow(() => {
          crawler.queue([URL1, URL2, URL3]);
        });
        return crawler.onIdle()
          .then(() => {
            assert.equal(Crawler.prototype.crawl.callCount, 3);
          });
      });

      it('crawls when queueing an object', () => {
        assert.doesNotThrow(() => {
          crawler.queue({ url: URL1 });
        });
        return crawler.onIdle()
          .then(() => {
            assert.equal(Crawler.prototype.crawl.callCount, 1);
          });
      });

      it('crawls when queueing multiple objects', () => {
        assert.doesNotThrow(() => {
          crawler.queue([{ url: URL1 }, { url: URL2 }, { url: URL3 }]);
        });
        return crawler.onIdle()
          .then(() => {
            assert.equal(Crawler.prototype.crawl.callCount, 3);
          });
      });

      it('crawls when queueing mixed styles', () => {
        assert.doesNotThrow(() => {
          crawler.queue([URL1, { url: URL2 }]);
          crawler.queue(URL3);
        });
        return crawler.onIdle()
          .then(() => {
            assert.equal(Crawler.prototype.crawl.callCount, 3);
          });
      });

      it('throws an error when queueing options with unavailable device', () => {
        assert.throws(() => {
          crawler.queue({ url: URL1, device: 'do-not-exist' });
        });
      });

      it('throws an error when delay is set', () => {
        assert.throws(() => {
          crawler.queue({ url: URL1, delay: 100 });
        });
      });

      it('does not skip crawling when queueing options with preRequest returns true', () => {
        function preRequest() {
          return Promise.resolve(true);
        }
        assert.doesNotThrow(() => {
          crawler.queue({ url: URL1, preRequest });
        });
        return crawler.onIdle()
          .then(() => {
            assert.equal(Crawler.prototype.crawl.callCount, 1);
          });
      });

      it('skips crawling when queueing options with preRequest returns false', () => {
        function preRequest() {
          return Promise.resolve(false);
        }
        assert.doesNotThrow(() => {
          crawler.queue({ url: URL1, preRequest });
        });
        return crawler.onIdle()
          .then(() => {
            assert.equal(Crawler.prototype.crawl.callCount, 0);
          });
      });

      it('can modify options by preRequest option', () => {
        const path = './tmp/example.png';
        function preRequest(options) {
          options.screenshot = { path };
          return Promise.resolve(true);
        }
        assert.doesNotThrow(() => {
          crawler.queue({ url: URL1, preRequest });
        });
        return crawler.onIdle()
          .then(() => {
            const { screenshot } = Crawler.prototype.crawl.firstCall.thisValue._options;
            assert.deepEqual(screenshot, { path });
          });
      });

      it('crawls when the requested domain is allowed', () => {
        assert.doesNotThrow(() => {
          crawler.queue({ url: URL1, allowedDomains: ['example.com', 'example.net'] });
        });
        return crawler.onIdle()
          .then(() => {
            assert.equal(Crawler.prototype.crawl.callCount, 1);
          });
      });

      it('skips crawling when the requested domain is not allowed', () => {
        assert.doesNotThrow(() => {
          crawler.queue({ url: URL1, allowedDomains: ['example.net', 'example.org'] });
        });
        return crawler.onIdle()
          .then(() => {
            assert.equal(Crawler.prototype.crawl.callCount, 0);
          });
      });
    });

    context('when the crawler is launched with device option', () => {
      beforeEach(() => (
        HCCrawler.launch({ device: 'iPhone 6' })
          .then(_crawler => {
            crawler = _crawler;
          })
      ));

      afterEach(() => crawler.close());

      it('overrides device by queueing options', () => {
        assert.doesNotThrow(() => {
          crawler.queue({ url: URL1, device: 'Nexus 6' });
        });
        return crawler.onIdle()
          .then(() => {
            assert.equal(Crawler.prototype.crawl.callCount, 1);
            assert.equal(Crawler.prototype.crawl.firstCall.thisValue._options.device, 'Nexus 6');
          });
      });
    });

    context('when the crawler is launched with maxDepth = 2', () => {
      beforeEach(() => (
        HCCrawler.launch({ maxDepth: 2 })
          .then(_crawler => {
            crawler = _crawler;
          })
      ));

      afterEach(() => crawler.close());

      it('automatically follows links', () => {
        assert.doesNotThrow(() => {
          crawler.queue(URL1);
        });
        return crawler.onIdle()
          .then(() => {
            assert.equal(Crawler.prototype.crawl.callCount, 2);
          });
      });
    });

    context('when the crawler is launched with maxConcurrency = 1', () => {
      beforeEach(() => (
        HCCrawler.launch({ maxConcurrency: 1 })
          .then(_crawler => {
            crawler = _crawler;
          })
      ));

      afterEach(() => crawler.close());

      it('obeys priority order', () => {
        assert.doesNotThrow(() => {
          crawler.queue({ url: URL1 });
          crawler.queue({ url: URL2, priority: 1 });
          crawler.queue({ url: URL3, priority: 2 });
        });
        return crawler.onIdle()
          .then(() => {
            assert.equal(Crawler.prototype.crawl.callCount, 3);
            assert.equal(Crawler.prototype.crawl.firstCall.thisValue._options.url, URL1);
            assert.equal(Crawler.prototype.crawl.secondCall.thisValue._options.url, URL3);
            assert.equal(Crawler.prototype.crawl.thirdCall.thisValue._options.url, URL2);
          });
      });

      it('does not throw an error when delay option is set', () => {
        assert.doesNotThrow(() => {
          crawler.queue({ url: URL1, delay: 100 });
        });
        return crawler.onIdle()
          .then(() => {
            assert.equal(Crawler.prototype.crawl.callCount, 1);
          });
      });
    });

    context('when the crawler is launched with maxRequest option', () => {
      beforeEach(() => (
        HCCrawler.launch({ maxConcurrency: 1, maxRequest: 2 })
          .then(_crawler => {
            crawler = _crawler;
          })
      ));

      afterEach(() => crawler.close());

      it('pauses at maxRequest option', () => {
        assert.doesNotThrow(() => {
          crawler.queue(URL1);
          crawler.queue(URL2);
          crawler.queue(URL3);
        });
        return crawler.onIdle()
          .then(() => {
            assert.equal(Crawler.prototype.crawl.callCount, 2);
          });
      });

      it('resumes from maxRequest option', () => {
        assert.doesNotThrow(() => {
          crawler.queue(URL1);
          crawler.queue(URL2);
          crawler.queue(URL3);
        });
        return crawler.onIdle()
          .then(() => {
            crawler.setMaxRequest(3);
            crawler.resume();
            return crawler.onIdle();
          })
          .then(() => {
            assert.equal(Crawler.prototype.crawl.callCount, 3);
          });
      });
    });

    context('when the crawler is launched with crawler option', () => {
      function removeTemporaryFile(file) {
        return new Promise(resolve => {
          unlink(file, (() => void resolve()));
        });
      }

      function readTemporaryFile(file) {
        return new Promise((resolve, reject) => {
          readFile(file, ENCODING, ((error, result) => {
            if (error) return reject(error);
            return resolve(result);
          }));
        });
      }

      afterEach(() => (
        crawler.close()
          .then(() => removeTemporaryFile(CSV_FILE))
      ));

      context('when the crawler is launched with exporter = CSVExporter', () => {
        beforeEach(() => (
          removeTemporaryFile(CSV_FILE)
            .then(() => {
              const exporter = new CSVExporter({
                file: CSV_FILE,
                fields: ['result.title'],
              });
              return HCCrawler.launch({ maxConcurrency: 1, exporter })
                .then(_crawler => {
                  crawler = _crawler;
                });
            })
        ));

        it('exports a CSV file', () => {
          assert.doesNotThrow(() => {
            crawler.queue(URL1);
            crawler.queue(URL2);
          });
          return crawler.onIdle()
            .then(() => readTemporaryFile(CSV_FILE))
            .then(actual => {
              const header = 'result.title\n';
              const line1 = 'Example Domain\n';
              const line2 = 'Example Domain\n';
              const expected = header + line1 + line2;
              assert.equal(actual, expected);
            });
        });
      });

      context('when the crawler is launched with exporter = JSONLineExporter', () => {
        beforeEach(() => (
          removeTemporaryFile(JSON_FILE)
            .then(() => {
              const exporter = new JSONLineExporter({
                file: JSON_FILE,
                fields: ['result.title'],
              });
              return HCCrawler.launch({ maxConcurrency: 1, exporter })
                .then(_crawler => {
                  crawler = _crawler;
                });
            })
        ));

        it('exports a json-line file', () => {
          assert.doesNotThrow(() => {
            crawler.queue(URL1);
            crawler.queue(URL2);
          });
          return crawler.onIdle()
            .then(() => readTemporaryFile(JSON_FILE))
            .then(actual => {
              const line1 = `${JSON.stringify({ result: { title: 'Example Domain' } })}\n`;
              const line2 = `${JSON.stringify({ result: { title: 'Example Domain' } })}\n`;
              const expected = line1 + line2;
              assert.equal(actual, expected);
            });
        });
      });
    });

    context('when the crawler is launched with default cache', () => {
      beforeEach(() => (
        HCCrawler.launch({ maxConcurrency: 1 })
          .then(_crawler => {
            crawler = _crawler;
          })
      ));

      afterEach(() => crawler.close());

      it('does not crawl already cached url', () => {
        assert.doesNotThrow(() => {
          crawler.queue(URL1);
          crawler.queue(URL2);
          crawler.queue(URL1); // The queue won't be requested
        });
        return crawler.onIdle()
          .then(() => {
            assert.equal(Crawler.prototype.crawl.callCount, 2);
          });
      });
    });

    context('when the crawler is launched with redis cache', () => {
      context('for the fist time with persistCache = true', () => {
        beforeEach(() => (
          HCCrawler.launch({ cache: new RedisCache(), persistCache: true })
            .then(_crawler => {
              crawler = _crawler;
              return crawler.clearCache();
            })
        ));

        afterEach(() => crawler.close());

        it('crawls all queued urls', () => {
          assert.doesNotThrow(() => {
            crawler.queue(URL1);
            crawler.queue(URL2);
          });
          return crawler.onIdle()
            .then(() => {
              assert.equal(Crawler.prototype.crawl.callCount, 2);
            });
        });
      });

      context('for the second time', () => {
        beforeEach(() => (
          HCCrawler.launch({ cache: new RedisCache() })
            .then(_crawler => {
              crawler = _crawler;
            })
        ));

        afterEach(() => crawler.close());

        it('does not crawl already cached url', () => {
          assert.doesNotThrow(() => {
            crawler.queue(URL2);
            crawler.queue(URL3);
          });
          return crawler.onIdle()
            .then(() => {
              assert.equal(Crawler.prototype.crawl.callCount, 1);
            });
        });
      });
    });

    context('when the crawler is launched without cache', () => {
      beforeEach(() => (
        HCCrawler.launch({ maxConcurrency: 1, cache: null })
          .then(_crawler => {
            crawler = _crawler;
          })
      ));

      afterEach(() => crawler.close());

      it('crawls duplicate urls', () => {
        assert.doesNotThrow(() => {
          crawler.queue(URL1);
          crawler.queue(URL2);
          crawler.queue(URL1); // The queue will be requested
        });
        return crawler.onIdle()
          .then(() => {
            assert.equal(Crawler.prototype.crawl.callCount, 3);
          });
      });
    });
  });

  context('when crawling fails', () => {
    beforeEach(() => {
      const error = new Error('Unexpected error occured while crawling!');
      sinon.stub(Crawler.prototype, 'crawl').returns(Promise.reject(error));
      return HCCrawler.launch()
        .then(_crawler => {
          crawler = _crawler;
        });
    });

    afterEach(() => crawler.close());

    it('retries and gives up', () => {
      assert.doesNotThrow(() => {
        crawler.queue({ url: URL1, retryCount: 3, retryDelay: 100 });
      });
      return crawler.onIdle()
        .then(() => {
          assert.equal(Crawler.prototype.crawl.callCount, 4);
        });
    });
  });
});
