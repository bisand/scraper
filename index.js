const puppeteer = require('puppeteer')
const dotenv = require('dotenv');

const once = function (checkFn, opts = {}) {
    return new Promise((resolve, reject) => {
        const startTime = new Date();
        const timeout = opts.timeout || 10000;
        const interval = opts.interval || 100;
        const timeoutMsg = opts.timeoutMsg || "Timeout!";

        const poll = function () {
            const ready = checkFn();
            if (ready) {
                resolve(ready);
            } else if ((new Date()) - startTime > timeout) {
                reject(new Error(timeoutMsg));
            } else {
                setTimeout(poll, interval);
            }
        }

        poll();
    })
};

async function login() {
    try {
        const URL = 'https://www.nordnet.no/login-next'
        const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1024, height: 768 }, args: ['--disable-dev-shm-usage'] })
        const page = await browser.newPage()

        await page.goto(URL)
        await page.click('button#cookie-accept-all-secondary');
        await page.click('button#otp-view')

        await page.type('input[name="username"]', process.env.NORDNET_USERNAME)
        await page.type('input[name="password"]', process.env.NORDNET_PASSWORD)

        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation(),
        ]);

        let dataCollected = false;
        page.on('response', async response => {
            const isAPI = response.url().includes('/api/2/batch')
            const isPOST = response.request().method() === 'POST'
            const isJson = response.headers()['content-type'].includes('application/json');

            if (isAPI && isPOST && isJson) {
                const postData = JSON.parse(JSON.parse(response.request().postData())['batch']);
                let posIdx = -1;
                for (let i = 0; i < postData.length; i++) {
                    const item = postData[i];
                    if (item.relative_url.includes('accounts/2/positions')) {
                        posIdx = i;
                        break;
                    }
                }

                if (posIdx === -1)
                    return;

                const json = await response.json().catch(err => {
                    console.error(err);
                });
                if (Array.isArray(json) && json.length > 0 && json[posIdx]['body'] && Array.isArray(json[posIdx]['body'])) {
                    console.log('Reading...');
                    json[posIdx]['body'].forEach(data => {
                        console.log(data);
                    });
                    console.log('\n 🚀 We got one!: ', response.url());
                    dataCollected = true;
                }
            }
        });

        await Promise.all([
            page.goto('https://www.nordnet.no/overview/details/2', { /*waitUntil: 'networkidle0' */ }),
            once(() => dataCollected)
        ]).catch(reason => {
            console.error(reason);
        });

        await browser.close();

    } catch (error) {
        console.error(error)
    }
}

dotenv.config();
if (process.env.NORDNET_USERNAME && process.env.NORDNET_PASSWORD) {
    login();
}
