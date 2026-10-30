// Modified by EasyArr — originally from getumbrel/umbrel packages/ui/src/components/app-icon.tsx@11e7f5bdfcb5bb8b46f39edd6defb4c37641763a
import {HTMLProps, useEffect, useState} from 'react'

import {cn} from '@/lib/utils'

// EasyArr: neutral placeholder (Umbrel's placeholder asset is not vendored).
const APP_ICON_PLACEHOLDER_SRC =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23ffffff1a'/%3E%3C/svg%3E"

type AppIconProps = {src?: string; size?: number; ref?: React.Ref<HTMLImageElement>} & HTMLProps<HTMLImageElement>

export function AppIcon({src, style, size, className, ref, ...props}: AppIconProps) {
	// Keep a local copy of the image `src` so we can gracefully fall back to a
	// placeholder if the provided source fails to load. Because `src` can change
	// (for example, when navigating between different apps without remounting the
	// component), we need to update the local state whenever the prop changes.
	const [imgSrc, setImgSrc] = useState(src || APP_ICON_PLACEHOLDER_SRC)

	// If the `src` prop updates, refresh `imgSrc` so the new icon is displayed.
	useEffect(() => {
		setImgSrc(src || APP_ICON_PLACEHOLDER_SRC)
	}, [src])

	// Not using `FadeImg` because we have a placeholder and `FadeImg` doesn't support placeholder images
	// Also not fading any other way because we want color-thief to work by picking up the color
	return (
		<img
			src={imgSrc}
			alt=''
			ref={ref}
			className={cn(
				'aspect-square shrink-0 border-[1px] border-slate-100/10 bg-white/10 bg-cover bg-center',
				className,
			)}
			onError={() => setImgSrc(APP_ICON_PLACEHOLDER_SRC)}
			style={{
				...style,
				width: size,
				height: size,
				minWidth: size,
				minHeight: size,
			}}
			{...props}
		/>
	)
}
