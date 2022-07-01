import { expect } from 'chai';
import * as cheerio from 'cheerio';
import path from 'path';
import sizeOf from 'image-size';
import { loadFixture } from './test-utils.js';

let fixture;

describe('SSG images', function () {
	before(async () => {
		fixture = await loadFixture({ root: './fixtures/basic-image/' });
	});

	function verifyImage(pathname, expected) {
		const dist = path.join('test/fixtures/basic-image/dist', pathname);
		const result = sizeOf(dist);
		expect(result).to.deep.equal(expected);
	}

	describe('build', () => {
		let $;
		let html;

		before(async () => {
			await fixture.build();

			html = await fixture.readFile('/index.html');
			$ = cheerio.load(html);
		});

		describe('Local images', () => {
			it('includes src, width, and height attributes', () => {
				const image = $('#social-jpg');

				expect(image.attr('src')).to.equal('/_image/assets/social_506x253.jpg');
				expect(image.attr('width')).to.equal('506');
				expect(image.attr('height')).to.equal('253');
			});

			it('built the optimized image', () => {
				verifyImage('_image/assets/social_506x253.jpg', { width: 506, height: 253, type: 'jpg' });
			});

			it('dist includes original image', () => {
				verifyImage('assets/social.jpg', { width: 2024, height: 1012, type: 'jpg' });
			});
		});

		describe('Remote images', () => {
			it('includes src, width, and height attributes', () => {
				const image = $('#google');

				expect(image.attr('src')).to.equal('/_image/googlelogo_color_272x92dp_544x184.webp');
				expect(image.attr('width')).to.equal('544');
				expect(image.attr('height')).to.equal('184');
			});

			it('built the optimized image', () => {
				verifyImage('_image/googlelogo_color_272x92dp_544x184.webp', { width: 544, height: 184, type: 'webp' });
			});
		});
	});

	describe('dev', () => {
		let devServer;
		let $;

		before(async () => {
			devServer = await fixture.startDevServer();
			const html = await fixture.fetch('/').then((res) => res.text());
			$ = cheerio.load(html);
		});

		after(async () => {
			await devServer.stop();
		});

		describe('Local images', () => {
			it('includes src, width, and height attributes', () => {
				const image = $('#social-jpg');

				const src = image.attr('src');
				const [route, params] = src.split('?');

				expect(route).to.equal('/_image');

				const searchParams = new URLSearchParams(params);

				expect(searchParams.get('f')).to.equal('jpg');
				expect(searchParams.get('w')).to.equal('506');
				expect(searchParams.get('h')).to.equal('253');
				// TODO: possible to avoid encoding the full image path?
				expect(searchParams.get('href').endsWith('/assets/social.jpg')).to.equal(true);
			});

			it('returns the optimized image', async () => {
				const image = $('#social-jpg');
				
				const res = await fixture.fetch(image.attr('src'));
				
				expect(res.status).to.equal(200);
				expect(res.headers.get('Content-Type')).to.equal('image/jpeg');

				// TODO: verify image file? It looks like sizeOf doesn't support ArrayBuffers
			});
		});

		describe('Remote images', () => {
			it('includes src, width, and height attributes', () => {
				const image = $('#google');

				const src = image.attr('src');
				const [route, params] = src.split('?');

				expect(route).to.equal('/_image');

				const searchParams = new URLSearchParams(params);

				expect(searchParams.get('f')).to.equal('webp');
				expect(searchParams.get('w')).to.equal('544');
				expect(searchParams.get('h')).to.equal('184');
				expect(searchParams.get('href')).to.equal('https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png');
			});
		});
	});
});
