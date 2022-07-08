import { lookup } from 'mrmime';
import { extname } from 'path';
import { getImage } from './get-image.js';
import { ImageAttributes, ImageMetadata, ImageService, OutputFormat, TransformOptions } from './types.js';
import { parseAspectRatio } from './utils.js';

export interface GetPictureParams {
	loader: ImageService;
	src: string | ImageMetadata | Promise<{ default: ImageMetadata }>;
	widths: number[];
	formats: OutputFormat[];
	aspectRatio?: TransformOptions['aspectRatio'];
}

export interface GetPictureResult {
	image: ImageAttributes;
	sources: { type: string; srcset: string; }[];
}

async function resolveAspectRatio({ src, aspectRatio }: GetPictureParams) {
	if (typeof src === 'string') {
		return parseAspectRatio(aspectRatio);
	} else {
		const metadata = 'then' in src ? (await src).default : src;
		return parseAspectRatio(aspectRatio) || metadata.width / metadata.height;
	}
}

async function resolveFormats({ src, formats }: GetPictureParams) {
	const unique = new Set(formats);

	if (typeof src === 'string') {
		unique.add(extname(src).replace('.', '') as OutputFormat);
	} else {
		const metadata = 'then' in src ? (await src).default : src;
		unique.add(extname(metadata.src).replace('.', '') as OutputFormat);
	}

	return [...unique];
}

export async function getPicture(params: GetPictureParams): Promise<GetPictureResult> {
	const { loader, src, widths, formats } = params;

	const aspectRatio = await resolveAspectRatio(params);

	if (!aspectRatio) {
		throw new Error('`aspectRatio` must be provided for remote images');
	}

	async function getSource(format: OutputFormat) {
		const imgs = await Promise.all(widths.map(async (width) => {
			const img = await getImage(loader, { src, format, width, height: Math.round(width / aspectRatio!) });
			return `${img.src} ${width}w`;
		}))

		return {
			type: lookup(format) || format,
			srcset: imgs.join(',')
		};
	}

	// always include the original image format
	const allFormats = await resolveFormats(params);

	const image = await getImage(loader, {
		src,
		width: Math.max(...widths),
		aspectRatio,
		format: allFormats[allFormats.length - 1]
	});

	const sources = await Promise.all(allFormats.map(format => getSource(format)));

	return {
		sources,
		image
	}
}
