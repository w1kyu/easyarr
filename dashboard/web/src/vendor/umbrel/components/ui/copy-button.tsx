// Modified by EasyArr — originally from getumbrel/umbrel packages/ui/src/components/ui/copy-button.tsx@11e7f5bdfcb5bb8b46f39edd6defb4c37641763a
import {useState} from 'react'
import {useTranslation} from 'react-i18next'
import {TbCopy} from 'react-icons/tb'
import {useCopyToClipboard} from 'react-use'

import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'

export function CopyButton({value}: {value: string}) {
	const {t} = useTranslation()
	const [, copyToClipboard] = useCopyToClipboard()
	const [showCopied, setShowCopied] = useState(false)

	return (
		<Tooltip open={showCopied}>
			<TooltipTrigger asChild>
				<button
					className='rounded-4 opacity-20 transition-opacity ring-inset hover:opacity-40 focus:outline-hidden focus-visible:opacity-60'
					onClick={async () => {
						copyToClipboard(value)
						setShowCopied(true)
						await sleep(1000)
						setShowCopied(false)
					}}
				>
					<TbCopy className='shrink-0' />
				</button>
			</TooltipTrigger>
			{/* TODO: consider putting in portal to avoid inheriting parent's styling */}
			<TooltipContent>{t('clipboard.copied')}</TooltipContent>
		</Tooltip>
	)
}

function sleep(milliseconds: number) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
