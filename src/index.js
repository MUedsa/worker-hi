import { Router } from 'itty-router';
import { initDebug } from "./debug";
import Res from "./response-util";
import { parseMetaInfo, parseAssetsInfo } from './github-page-util';
import {parseVideoInfo, parsePlayInfo, parseHomePageVideoList} from './bilibili-page-util';
import { buildMPD } from './bilibili-dash-util';
// Create a new router
const router = Router();

// errorHandler
const errorHandler = (error, event) => {
	let others = {};
	if(event.__debug_log && event.__debug_log.debugFlag) {
		others.debug = event.__debug_log.toString();
	}
	console.error(error);
	return Res.jsonError(error.status || 500, error.message || 'Server Error', others);
};

// github repository api
const GITHUB_REPOSITORY_RELEASE_LATEST_URL = "https://github.com/${user}/${repo}/releases/latest";
const GITHUB_REPOSITORY_RELEASE_TAG_URL = "https://github.com/${user}/${repo}/releases/tag/${tag}";
const GITHUB_REPOSITORY_RELEASE_TAG_ASSERT_URL = "https://github.com/${user}/${repo}/releases/expanded_assets/${tag}";
const HEADER = {
	"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36",
	"Accept": "*/*"
}

const BILIBILI_VIDEO_BV_URL = "https://www.bilibili.com/video/BV${bvSuffix}";
const BILIBILI_URL = "https://www.bilibili.com";

router.get("/github/:user/:repo/releases/latest", async ({ params, __debug_log }) => {
	const url = GITHUB_REPOSITORY_RELEASE_LATEST_URL
		.replace("${user}", params.user)
		.replace("${repo}", params.repo);
	const html = await (await doFetch(url, {}, __debug_log)).text();
	const mateInfo = parseMetaInfo(html);
	if(__debug_log && __debug_log.debugFlag) mateInfo.__debug_log = __debug_log.toString();
	return Res.jsonSuccess(mateInfo);
});

router.get("/github/:user/:repo/releases/tag/:tag", async ({ params, __debug_log }) => {
	const url = GITHUB_REPOSITORY_RELEASE_TAG_URL
		.replace("${user}", params.user)
		.replace("${repo}", params.repo)
		.replace("${tag}", params.tag);

	const html = await (await doFetch(url, {}, __debug_log)).text();
	const mateInfo = parseMetaInfo(html);
	if(__debug_log && __debug_log.debugFlag) mateInfo.__debug_log = __debug_log.toString();
	return Res.jsonSuccess(mateInfo);
});

router.get("/github/:user/:repo/releases/assets/:tag", async ({ params, __debug_log }) => {
	const url = GITHUB_REPOSITORY_RELEASE_TAG_ASSERT_URL
		.replace("${user}", params.user)
		.replace("${repo}", params.repo)
		.replace("${tag}", params.tag);

	const html = await (await doFetch(url , {}, __debug_log)).text();
	const assertsInfo = parseAssetsInfo(html);
	if(__debug_log && __debug_log.debugFlag) assertsInfo.__debug_log = __debug_log.toString();
	return Res.jsonSuccess(assertsInfo);
});

router.get("/bilibili/BV:bvSuffix", async ({ params, headers, __debug_log }) => {
	const url = BILIBILI_VIDEO_BV_URL.replace("${bvSuffix}", params.bvSuffix);
	const html = await (await doFetch(url, { 'cookie': headers.get('cookie')}, __debug_log)).text();
	const videoInfo = parseVideoInfo(html);
	const playInfo = parsePlayInfo(html);
	return Res.jsonSuccess({
		videoInfo: videoInfo,
		playInfo: playInfo
	});
});

router.get("/bilibili/home", async ({ headers, __debug_log  }) => {
	const html = await (await doFetch(BILIBILI_URL, { 'cookie': headers.get('cookie')}, __debug_log)).text();
	const videoList = parseHomePageVideoList(html);
	return Res.jsonSuccess(videoList);
});

router.get("/bilibili/dash/BV:bvSuffix.mbp", async ({ params, query, headers, __debug_log }) => {
	const url = BILIBILI_VIDEO_BV_URL.replace("${bvSuffix}", params.bvSuffix);
	const html = await (await doFetch(url, { 'cookie': headers.get('cookie')}, __debug_log)).text();
	const playInfo = parsePlayInfo(html);
	return Res.text(buildMPD(playInfo.data.dash.video, playInfo.data.dash.audio, query.filter));
});

router.post("/bilibili/dash/build", async request  => {
	const {dash, filter} = await request.json();
	if(!dash || !Array.isArray(dash.video) || !Array.isArray(dash.audio)){
		return Res.jsonError(100003, '????????????');
	}
	return Res.text(buildMPD(dash.video, dash.audio, filter));
});

async function doFetch(url, headers = {}, __debug_log) {
	headers = Object.assign({...HEADER}, headers)
	if(__debug_log) __debug_log.log('fetch url:', url);
	if(__debug_log) __debug_log.log('headers:', headers);
	const response = await fetch(url, {
		method: 'GET',
		headers: headers,
	});
	if(__debug_log) __debug_log.log('response:', await response.clone().text());
	if(response.status !== 200){
		throw new Error(`fetch ${url}, ${response.status} ${response.statusText}`);
	}
	return response;
}

// 404 for everything else
router.all('*', () => Res.BASE_404());

/*
This snippet ties our worker to the router we deifned above, all incoming requests
are passed to the router where your routes are called and the response is sent.
*/
addEventListener('fetch', (event) => {
	initDebug(event);
	event.respondWith(router.handle(event.request)
		.catch(error => errorHandler(error, event)));
});
