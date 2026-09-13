import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './App.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const campaigns = [
	{ id: 'brumes', title: 'Les Brumes de Valombre', system: 'Chroniques d20', next: 'Ce soir, 20:30', place: 'Salon vocal 01', progress: 'Chapitre III', players: 5, gmId: 'orin', members: ['elyra'], sessions: [{ id: 's1', date: '2024-09-15', time: '20:30', place: 'Salon vocal 01', status: 'planned' }], tone: 'teal' },
	{ id: 'cendres', title: 'Les Cendres du Roi', system: 'D&D 5e', next: 'Sam. 21 septembre', place: 'Table 2', progress: 'Acte I', players: 4, gmId: 'orin', invitedUserIds: ['elyra'], invitationStatuses: { elyra: 'pending' }, sessions: [{ id: 's2', date: '2024-09-21', time: '14:00', place: 'Table 2', status: 'planned' }], tone: 'gold' },
]

const character = {
	name: 'Elyra Venn',
	className: 'Arcaniste des marais',
	level: 4,
	quote: 'La magie ne demande pas la permission. Elle attend qu’on l’écoute.',
	stats: [
		['FOR', '9', '+0'],
		['DEX', '14', '+2'],
		['INT', '17', '+3'],
		['SAG', '13', '+1'],
	],
	items: [
		['Grimoire de terrain', 'Objet clé', '✦'],
		['Fiole de brume x2', 'Consommable', '◒'],
		['Dague en verre noir', 'Arme légère', '⌁'],
	],
}

const defaultMessages = [
	['MJ', 'La porte du phare vient de s’ouvrir. Soyez prêts pour ce soir.', '18:42'],
	['Milo', 'J’ai préparé une théorie sur les symboles de la crypte.', '18:47'],
]

const friends = [
	{ id: 'milo', initials: 'ML', name: 'Milo Thorne', detail: 'Éclaireur des brumes', role: 'player' },
	{ id: 'soren', initials: 'SA', name: 'Soren Ash', detail: 'Gardien de la tour', role: 'player' },
	{ id: 'lina', initials: 'LN', name: 'Lina Nox', detail: 'Herboriste', role: 'player' },
	{ id: 'cass', initials: 'CA', name: 'Cass Orme', detail: 'Barde itinérant', role: 'player' },
]

const users = {
	player: { id: 'elyra', initials: 'EV', name: 'Elyra Venn', label: 'Joueur', role: 'player' },
	gm: { id: 'orin', initials: 'OR', name: 'Maître Orin', label: 'Maître de jeu', role: 'gm' },
}

const templateAttributes = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA']
const campaignsStorageKey = 'arcades-campaigns'
const characterStorageKey = 'arcades-character'

function getDefaultCharacter(campaignId) {
	return { ...character, campaignId }
}

function formatSessionDate(date, time) {
	if (!date || !time) return 'Date à définir'
	const parsedDate = new Date(`${date}T${time}`)
	if (Number.isNaN(parsedDate.getTime())) return `${date} · ${time}`
	return `${parsedDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} · ${time}`
}

function loadCampaigns() {
	try {
		const storedCampaigns = window.localStorage.getItem(campaignsStorageKey)
		const savedCampaigns = storedCampaigns ? JSON.parse(storedCampaigns) : campaigns
		return savedCampaigns.map((item) => normalizeCampaign(item))
	} catch {
		return campaigns.map((item) => normalizeCampaign(item))
	}
}

function normalizeCampaign(campaign) {
	const legacyIds = (campaign.invitedFriends || []).map((friend) => friends.find((item) => item.id === friend || item.name === friend)?.id).filter(Boolean)
	const invitedUserIds = campaign.invitedUserIds || (legacyIds.length ? legacyIds : (campaign.id === 'cendres' ? ['elyra'] : []))
	return {
		...campaign,
		gmId: campaign.gmId || 'orin',
		invitedUserIds,
		invitationStatuses: campaign.invitationStatuses || Object.fromEntries(invitedUserIds.map((id) => [id, 'pending'])),
		sessions: campaign.sessions || (campaign.sessionDate ? [{ id: `legacy-${campaign.id}`, date: campaign.sessionDate, time: campaign.sessionTime || '', place: campaign.sessionPlace || campaign.place || '', status: 'planned' }] : []),
		characterTemplate: campaign.characterTemplate ? { ...campaign.characterTemplate, zones: (campaign.characterTemplate.zones || []).map((zone) => ({ ...zone, page: zone.page || 1 })) } : campaign.characterTemplate,
	}
}

function loadCharacter() {
	try {
		const storedCharacter = window.localStorage.getItem(characterStorageKey)
		return storedCharacter ? JSON.parse(storedCharacter) : character
	} catch {
		return character
	}
}

function loadCharacters() {
	try {
		const storedCharacters = window.localStorage.getItem(`${characterStorageKey}s`)
		if (storedCharacters) return JSON.parse(storedCharacters)
		const legacyCharacter = window.localStorage.getItem(characterStorageKey)
		return legacyCharacter ? { [campaigns[0].id]: { ...JSON.parse(legacyCharacter), campaignId: campaigns[0].id } } : {}
	} catch {
		return {}
	}
}

const Mark = ({ children }) => <span className="mark">{children}</span>

async function loadPdf(data) {
	const response = await fetch(data)
	const buffer = await response.arrayBuffer()
	return pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
}

function SheetZoneOverlay({ zone, containerRef, onResize, onMove }) {
	const resizeStart = useRef(null)
	const moveStart = useRef(null)

	const startResize = (event) => {
		event.stopPropagation()
		const bounds = containerRef.current?.getBoundingClientRect()
		if (!bounds) return
		resizeStart.current = { x: event.clientX, y: event.clientY, width: zone.width, height: zone.height, bounds }
		event.currentTarget.setPointerCapture?.(event.pointerId)
	}

	const resize = (event) => {
		if (!resizeStart.current) return
		const start = resizeStart.current
		onResize(zone.id, {
			width: Math.max(5, Math.min(90 - zone.x, start.width + ((event.clientX - start.x) / start.bounds.width) * 100)),
			height: Math.max(4, Math.min(90 - zone.y, start.height + ((event.clientY - start.y) / start.bounds.height) * 100)),
		})
	}

	const stopResize = () => { resizeStart.current = null }

	const startMove = (event) => {
		event.preventDefault()
		event.stopPropagation()
		const bounds = containerRef.current?.getBoundingClientRect()
		if (!bounds) return
		moveStart.current = { x: event.clientX, y: event.clientY, left: zone.x, top: zone.y, bounds }
		event.currentTarget.setPointerCapture?.(event.pointerId)
	}

	const move = (event) => {
		if (!moveStart.current) return
		const start = moveStart.current
		onMove(zone.id, {
			x: Math.max(0, Math.min(100 - zone.width, start.left + ((event.clientX - start.x) / start.bounds.width) * 100)),
			y: Math.max(0, Math.min(100 - zone.height, start.top + ((event.clientY - start.y) / start.bounds.height) * 100)),
		})
	}

	const stopMove = () => { moveStart.current = null }

	return <span className="sheet-zone" style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%` }} onClick={(event) => event.stopPropagation()}><button type="button" className="zone-move-handle" aria-label={`Déplacer ${zone.label}`} onPointerDown={startMove} onPointerMove={move} onPointerUp={stopMove} onPointerCancel={stopMove}>↕</button><span className="sheet-zone-label">{zone.label}</span><button type="button" className="zone-resize-handle" aria-label={`Redimensionner ${zone.label}`} onPointerDown={startResize} onPointerMove={resize} onPointerUp={stopResize} onPointerCancel={stopResize} /></span>
}

function SheetDesignerPreview({ sheet, zones, onAddZone, onResize, onMove }) {
	const canvasRef = useRef(null)
	const previewRef = useRef(null)
	const [error, setError] = useState('')
	const [page, setPage] = useState(1)
	const [pageCount, setPageCount] = useState(1)

	useEffect(() => {
		if (!sheet?.data || sheet.type !== 'application/pdf') return undefined
		let cancelled = false
		const renderPdf = async () => {
			setError('')
			const pdf = await loadPdf(sheet.data)
			const documentPage = await pdf.getPage(page)
			setPageCount(pdf.numPages)
			const viewport = documentPage.getViewport({ scale: 1.2 })
			const canvas = canvasRef.current
			if (!canvas || cancelled) return
			canvas.width = viewport.width
			canvas.height = viewport.height
			await documentPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
		}
		renderPdf().catch(() => setError('Impossible de rendre ce PDF. Vérifiez que le fichier n’est pas protégé ou corrompu.'))
		return () => { cancelled = true }
	}, [sheet, page])

	if (!sheet?.data) return null
	return (
		<div className="sheet-preview" ref={previewRef} onClick={(event) => onAddZone(event, page)} role="button" tabIndex="0" aria-label="Ajouter une zone sur la feuille">
			{sheet.type === 'application/pdf' ? <canvas ref={canvasRef} /> : <img src={sheet.data} alt="Aperçu de la feuille importée" />}
			{error && <p className="sheet-render-error">{error}</p>}
			{zones.filter((zone) => zone.page === page).map((zone) => <SheetZoneOverlay key={zone.id} zone={zone} containerRef={previewRef} onResize={onResize} onMove={onMove} />)}
			{sheet.type === 'application/pdf' && <div className="sheet-page-controls"><button type="button" className="icon-button" disabled={page <= 1} onClick={(event) => { event.stopPropagation(); setPage((current) => current - 1) }}>←</button><span>Page {page} / {pageCount}</span><button type="button" className="icon-button" disabled={page >= pageCount} onClick={(event) => { event.stopPropagation(); setPage((current) => current + 1) }}>→</button></div>}
		</div>
	)
}

function CharacterSheetPreview({ sheet, zones, values, maxAttribute, onChange }) {
	const canvasRef = useRef(null)
	const [error, setError] = useState('')
	const [page, setPage] = useState(1)
	const [pageCount, setPageCount] = useState(1)

	useEffect(() => {
		if (!sheet?.data || sheet.type !== 'application/pdf') return undefined
		let cancelled = false
		const renderPdf = async () => {
			setError('')
			const pdf = await loadPdf(sheet.data)
			const documentPage = await pdf.getPage(page)
			setPageCount(pdf.numPages)
			const viewport = documentPage.getViewport({ scale: 1.2 })
			const canvas = canvasRef.current
			if (!canvas || cancelled) return
			canvas.width = viewport.width
			canvas.height = viewport.height
			await documentPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
		}
		renderPdf().catch(() => setError('Impossible de rendre ce PDF.'))
		return () => { cancelled = true }
	}, [sheet, page])

	const field = (zone) => zone.type === 'checkbox'
		? <input type="checkbox" checked={Boolean(values[zone.id])} onChange={(event) => onChange(zone.id, event.target.checked)} />
		: <input type="number" max={zone.max || maxAttribute} value={values[zone.id] || ''} onChange={(event) => onChange(zone.id, event.target.value)} />

	return <div className="character-sheet-preview">{sheet.type === 'application/pdf' ? <canvas ref={canvasRef} /> : <img src={sheet.data} alt="Feuille de personnage" />}{error && <p className="sheet-render-error">{error}</p>}{zones.filter((zone) => zone.page === page).map((zone) => <label className="character-zone-field" key={zone.id} style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%` }}><span>{zone.label}</span>{field(zone)}</label>)}{sheet.type === 'application/pdf' && <div className="sheet-page-controls"><button type="button" className="icon-button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>←</button><span>Page {page} / {pageCount}</span><button type="button" className="icon-button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>→</button></div>}</div>
}

function App() {
	const [screen, setScreen] = useState('login')
	const [role, setRole] = useState('player')
	const [campaignList, setCampaignList] = useState(loadCampaigns)
	const [campaign, setCampaign] = useState(campaigns[0])
	const [characters, setCharacters] = useState(loadCharacters)
	const [tab, setTab] = useState('character')
	const [message, setMessage] = useState('')
	const [messages, setMessages] = useState(defaultMessages)
	const [isCreatingCampaign, setIsCreatingCampaign] = useState(false)
	const [editingCampaign, setEditingCampaign] = useState(null)
	const [isEditingCharacter, setIsEditingCharacter] = useState(false)
	const [isAddingItem, setIsAddingItem] = useState(false)

	useEffect(() => {
		window.localStorage.setItem(campaignsStorageKey, JSON.stringify(campaignList))
	}, [campaignList])

	useEffect(() => {
		window.localStorage.setItem(`${characterStorageKey}s`, JSON.stringify(characters))
	}, [characters])

	const isGm = role === 'gm'
	const activeUser = users[role]
	const campaignIsGm = activeUser.id === campaign.gmId
	const currentCharacter = characters[campaign.id] || getDefaultCharacter(campaign.id)

	const enter = (nextRole = role) => {
		setRole(nextRole)
		setScreen('dashboard')
		setTab(nextRole === 'gm' ? 'overview' : 'character')
	}

	const openCampaign = (nextCampaign) => {
		setCampaign(nextCampaign)
		setTab(isGm ? 'overview' : 'character')
		setScreen('campaign')
	}

	const saveCampaign = (newCampaign) => {
		const campaignToSave = { ...newCampaign, gmId: editingCampaign?.gmId || activeUser.id }
		setCampaignList((current) => editingCampaign
			? current.map((item) => item.id === campaignToSave.id ? campaignToSave : item)
			: [...current, campaignToSave])
		setCampaign(campaignToSave)
		setIsCreatingCampaign(false)
		setEditingCampaign(null)
		setScreen('campaign')
		setTab('overview')
	}

	const updateCampaign = (updates) => {
		setCampaignList((current) => current.map((item) => item.id === campaign.id ? { ...item, ...updates } : item))
		setCampaign((current) => ({ ...current, ...updates }))
	}

	const deleteCampaign = (campaignToDelete) => {
		if (!window.confirm(`Supprimer la campagne « ${campaignToDelete.title} » ?`)) return
		setCampaignList((current) => current.filter((item) => item.id !== campaignToDelete.id))
		setScreen('dashboard')
		setCampaign(campaignList.find((item) => item.id !== campaignToDelete.id) || campaigns[0])
	}

	const saveCharacter = (updatedCharacter) => {
		setCharacters((current) => ({ ...current, [campaign.id]: { ...updatedCharacter, campaignId: campaign.id } }))
		setIsEditingCharacter(false)
	}

	const updateInventory = (items) => {
		setCharacters((current) => ({ ...current, [campaign.id]: { ...currentCharacter, items, campaignId: campaign.id } }))
		setIsAddingItem(false)
	}

	const respondToInvitation = (campaignId, response) => {
		setCampaignList((current) => current.map((item) => {
			if (item.id !== campaignId) return item
			const members = response === 'accepted' ? [...new Set([...(item.members || []), activeUser.id])] : (item.members || []).filter((id) => id !== activeUser.id)
			return { ...item, members, players: members.length, invitationStatuses: { ...item.invitationStatuses, [activeUser.id]: response } }
		}))
	}

	const respondToSession = (sessionId, response) => {
		updateCampaign({ sessions: (campaign.sessions || []).map((session) => session.id === sessionId ? { ...session, attendance: { ...(session.attendance || {}), [activeUser.id]: response } } : session) })
	}

	const sendMessage = (event) => {
		event.preventDefault()
		if (!message.trim()) return
		setMessages((current) => [...current, ['Vous', message.trim(), 'à l’instant']])
		setMessage('')
	}

	if (screen === 'login') {
		return <Login onEnter={enter} />
	}

	return (
		<main className="app-shell">
			<Sidebar
				screen={screen}
				role={role}
				user={activeUser}
				onHome={() => setScreen('dashboard')}
				onCampaign={() => openCampaign(campaignList[0])}
				onLogout={() => setScreen('login')}
			/>

			<section className="workspace">
				<header className="topbar">
					<div className="breadcrumbs">
						<span>ARCADES</span>
						<b>/</b>
						<strong>{screen === 'dashboard' ? 'Tableau de bord' : campaign.title}</strong>
					</div>

					<div className="top-actions">
						<button className="icon-button" type="button" aria-label="Décorations">♢</button>
						<button className="role-switch" type="button" onClick={() => setRole(isGm ? 'player' : 'gm')}>
							<span className={`role-icon ${campaignIsGm ? 'gm' : ''}`}>{campaignIsGm ? '♜' : '♙'}</span>
							{screen === 'campaign' ? (campaignIsGm ? `MJ · ${activeUser.id}` : `Joueur · ${activeUser.id}`) : (isGm ? `Espace MJ · ${activeUser.id}` : `Espace joueur · ${activeUser.id}`)}
							<span>⌄</span>
						</button>
					</div>
				</header>

				{screen === 'dashboard' ? <Dashboard isGm={isGm} campaigns={campaignList} user={activeUser} onOpen={openCampaign} onCreate={() => setIsCreatingCampaign(true)} onRespond={respondToInvitation} /> : <CampaignView isGm={campaignIsGm} campaign={campaign} character={currentCharacter} user={activeUser} tab={tab} setTab={setTab} messages={messages} message={message} setMessage={setMessage} sendMessage={sendMessage} onEdit={() => setEditingCampaign(campaign)} onDelete={() => deleteCampaign(campaign)} onEditCharacter={() => setIsEditingCharacter(true)} onAddItem={() => setIsAddingItem(true)} onRemoveItem={(itemName) => updateInventory(currentCharacter.items.filter(([name]) => name !== itemName))} onUpdateCampaign={updateCampaign} onRespondToSession={respondToSession} />}
			</section>

			{isGm && (isCreatingCampaign || editingCampaign) && <CampaignCreation campaign={editingCampaign} onCancel={() => { setIsCreatingCampaign(false); setEditingCampaign(null) }} onCreate={saveCampaign} />}
			{!isGm && isEditingCharacter && <CharacterEditor character={currentCharacter} campaign={campaign} onCancel={() => setIsEditingCharacter(false)} onSave={saveCharacter} />}
			{!isGm && isAddingItem && <ItemEditor items={currentCharacter.items} onCancel={() => setIsAddingItem(false)} onSave={(item) => updateInventory([...currentCharacter.items, item])} />}
		</main>
	)
}

function Login({ onEnter }) {
	return (
		<main className="login-shell">
			<div className="login-art" aria-hidden="true">
				<span>✦</span>
				<i>◌</i>
			</div>

			<section className="login-panel">
				<div className="brand">
					<Mark>✦</Mark>
					<span>ARCADES</span>
				</div>

				<div className="login-copy">
					<p className="eyebrow">Le cercle des histoires partagées</p>
					<h1>Entrez dans<br /><em>l’aventure.</em></h1>
					<p className="muted">Retrouvez votre table, votre personnage et les récits qui vous attendent.</p>
				</div>

				<form className="login-form" onSubmit={(event) => { event.preventDefault(); onEnter(); }}>
					<label>
						Adresse e-mail
						<input type="email" defaultValue="elyra@arcades.fr" />
					</label>

					<label>
						Mot de passe
						<input type="password" defaultValue="arcades" />
					</label>

					<div className="form-row">
						<label className="check">
							<input type="checkbox" defaultChecked />
							Se souvenir de moi
						</label>
						<button type="button" className="text-button">Mot de passe oublié ?</button>
					</div>

					<button className="primary-button" type="submit">
						Ouvrir le grimoire <span>↗</span>
					</button>
				</form>

				<p className="signup">
					Pas encore de compte ? <button className="text-button">Créer un accès</button>
				</p>
			</section>
		</main>
	)
}

function CampaignCreation({ campaign, onCancel, onCreate }) {
	const [form, setForm] = useState({
		title: campaign?.title || '',
		game: campaign?.system || '',
		maxPlayers: String(campaign?.maxPlayers || '4'),
		substitutes: String(campaign?.substitutes || '1'),
		pace: campaign?.pace || 'Hebdomadaire',
		materials: campaign?.materials || '',
		sessionDate: campaign?.sessionDate || '',
		sessionTime: campaign?.sessionTime || '',
		sessionPlace: campaign?.sessionPlace || campaign?.place || '',
	})
	const [selectedFriends, setSelectedFriends] = useState(() => campaign?.invitedFriends ? friends.filter((friend) => campaign.invitedFriends.includes(friend.name)).map((friend) => friend.id) : [])
	const [selectedAttributes, setSelectedAttributes] = useState(campaign?.characterTemplate?.attributes || ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'])
	const [maxAttribute, setMaxAttribute] = useState(String(campaign?.characterTemplate?.maxAttribute || '20'))
	const [sheet, setSheet] = useState(campaign?.characterTemplate?.sheet || null)
	const [zones, setZones] = useState(campaign?.characterTemplate?.zones || [])
	const [error, setError] = useState('')
	const [isSheetExpanded, setIsSheetExpanded] = useState(false)

	const updateField = (event) => {
		const { name, value } = event.target
		setForm((current) => ({ ...current, [name]: value }))
	}

	const toggleFriend = (friendId) => {
		setSelectedFriends((current) => current.includes(friendId) ? current.filter((id) => id !== friendId) : [...current, friendId])
	}

	const toggleAttribute = (attribute) => {
		setSelectedAttributes((current) => current.includes(attribute) ? current.filter((item) => item !== attribute) : [...current, attribute])
	}

	const importSheet = (event) => {
		const file = event.target.files?.[0]
		if (!file) return
		if (!['application/pdf', 'image/png'].includes(file.type)) {
			setError('Importez uniquement un fichier PDF ou PNG.')
			return
		}
		const reader = new FileReader()
		reader.onload = () => setSheet({ name: file.name, type: file.type, data: reader.result })
		reader.readAsDataURL(file)
	}

	const addZone = (event, page = 1) => {
		const bounds = event.currentTarget.getBoundingClientRect()
		const x = Math.max(2, Math.min(80, ((event.clientX - bounds.left) / bounds.width) * 100 - 9))
		const y = Math.max(2, Math.min(86, ((event.clientY - bounds.top) / bounds.height) * 100 - 3.5))
		setZones((current) => [...current, { id: `zone-${Date.now()}`, label: `Zone ${current.length + 1}`, type: 'number', page, x, y, width: 18, height: 7, max: Number(maxAttribute) }])
	}

	const updateZone = (zoneId, updates) => setZones((current) => current.map((zone) => zone.id === zoneId ? { ...zone, ...updates } : zone))
	const resizeZone = (zoneId, dimensions) => updateZone(zoneId, dimensions)
	const moveZone = (zoneId, position) => updateZone(zoneId, position)

	const submit = (event) => {
		event.preventDefault()
		if (!selectedAttributes.length) {
			setError('Sélectionnez au moins une caractéristique pour la feuille.')
			return
		}

			const selectedNames = friends.filter((friend) => selectedFriends.includes(friend.id)).map((friend) => friend.name)
		onCreate({
			id: campaign?.id || `campaign-${Date.now()}`,
			title: form.title,
			system: form.game,
			next: formatSessionDate(form.sessionDate, form.sessionTime),
			place: form.sessionPlace || 'À définir',
			sessionDate: form.sessionDate,
			sessionTime: form.sessionTime,
			sessionPlace: form.sessionPlace,
			progress: 'Préparation',
			players: selectedFriends.length,
			maxPlayers: Number(form.maxPlayers),
			substitutes: Number(form.substitutes),
			pace: form.pace,
			materials: form.materials,
			gmId: 'orin',
			invitedUserIds: selectedFriends,
			invitedFriends: selectedNames,
			invitationStatuses: Object.fromEntries(selectedFriends.map((id) => [id, 'pending'])),
			characterTemplate: { attributes: selectedAttributes, maxAttribute: Number(maxAttribute), sheet, zones },
			tone: 'teal',
		})
	}

	return (
		<div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
			<section className="creation-modal" role="dialog" aria-modal="true" aria-labelledby="creation-title">
				<div className="modal-heading">
					<div>
						<p className="eyebrow">Espace maître de jeu</p>
						<h2 id="creation-title">{campaign ? 'Modifier la campagne' : 'Créer une campagne'}</h2>
						<p className="muted">{campaign ? 'Actualisez les paramètres de votre table.' : 'Préparez votre table avant d’inviter vos joueurs.'}</p>
					</div>
					<button type="button" className="icon-button" onClick={onCancel} aria-label="Fermer">×</button>
				</div>

				<form className="creation-form" onSubmit={submit}>
					<div className="creation-columns">
						<div className="creation-section">
							<p className="form-section-title">Paramètres de la table</p>
							<label>Nom de la campagne<input name="title" value={form.title} onChange={updateField} required placeholder="Ex. Les Veilleurs du nord" /></label>
							<label>Jeu / système<input name="game" value={form.game} onChange={updateField} required placeholder="Ex. D&D 5e, Chroniques d20" /></label>
							<div className="form-grid">
								<label>Joueurs maximum<input name="maxPlayers" type="number" min="1" max="20" value={form.maxPlayers} onChange={updateField} required /></label>
								<label>Suppléants<input name="substitutes" type="number" min="0" max="20" value={form.substitutes} onChange={updateField} required /></label>
							</div>
							<label>Rythme de jeu
								<select name="pace" value={form.pace} onChange={updateField}>
									<option>Hebdomadaire</option>
									<option>Bi-mensuel</option>
									<option>Mensuel</option>
									<option>Intensif / campagne courte</option>
								</select>
							</label>
							<label>Matériel à prévoir<textarea name="materials" value={form.materials} onChange={updateField} required placeholder="Dés, livre de règles, cartes, ambiance sonore..." /></label>
							<p className="form-section-title template-title">Prochaine session</p>
							<div className="form-grid">
								<label>Date<input name="sessionDate" type="date" value={form.sessionDate} onChange={updateField} /></label>
								<label>Heure<input name="sessionTime" type="time" value={form.sessionTime} onChange={updateField} /></label>
							</div>
							<label>Lieu ou salon vocal<input name="sessionPlace" value={form.sessionPlace} onChange={updateField} placeholder="Ex. Salon vocal 01" /></label>
						</div>

						<div className="creation-section">
							<p className="form-section-title">Joueurs invités</p>
							<p className="form-help">Sélectionnez les amis qui recevront une invitation à cette table.</p>
							<div className="friend-list">
								{friends.map((friend) => (
									<label className="friend-option" key={friend.id}>
										<input type="checkbox" checked={selectedFriends.includes(friend.id)} onChange={() => toggleFriend(friend.id)} />
										<span className="avatar">{friend.initials}</span>
										<span><strong>{friend.name}</strong><small>{friend.detail}</small></span>
									</label>
								))}
							</div>

							<p className="form-section-title template-title">Modèle de feuille</p>
							<p className="form-help">Choisissez les caractéristiques que les joueurs pourront renseigner.</p>
							<div className="attribute-list">
								{templateAttributes.map((attribute) => (
									<label className="attribute-option" key={attribute}>
										<input type="checkbox" checked={selectedAttributes.includes(attribute)} onChange={() => toggleAttribute(attribute)} />
										<span>{attribute}</span>
									</label>
								))}
							</div>
							<label>Valeur maximale<input type="number" min="1" max="999" value={maxAttribute} onChange={(event) => setMaxAttribute(event.target.value)} required /></label>
							<div className="sheet-import-block">
								<p className="form-section-title">Feuille visuelle</p>
								<p className="form-help">Importez un PDF ou un PNG, puis cliquez sur l’aperçu PNG pour placer une zone.</p>
								<label className="file-input-label">Importer la feuille<input type="file" accept="application/pdf,image/png" onChange={importSheet} /></label>
								{sheet && <p className="file-name">{sheet.type === 'application/pdf' ? 'PDF' : 'PNG'} · {sheet.name}</p>}
								{sheet?.data && <><div className="sheet-preview-actions"><button type="button" className="outline-button" onClick={() => setIsSheetExpanded(true)}>Ouvrir en grand ↗</button></div><SheetDesignerPreview sheet={sheet} zones={zones} onAddZone={addZone} onResize={resizeZone} onMove={moveZone} /></>}
								<div className="zone-list">
									{zones.map((zone) => <div className="zone-row" key={zone.id}><input value={zone.label} onChange={(event) => updateZone(zone.id, { label: event.target.value })} aria-label="Nom de zone" /><span className="zone-page">Page {zone.page || 1}</span><select value={zone.type} onChange={(event) => updateZone(zone.id, { type: event.target.value })}><option value="number">Valeur numérique</option><option value="checkbox">Case à cocher</option></select><button type="button" className="icon-button danger-icon" onClick={() => setZones((current) => current.filter((item) => item.id !== zone.id))} aria-label={`Supprimer ${zone.label}`}>×</button></div>)}
								</div>
								<button type="button" className="outline-button full-width" onClick={() => setZones((current) => [...current, { id: `zone-${Date.now()}`, label: `Zone ${current.length + 1}`, type: 'number', x: 10, y: 10 + current.length * 9, width: 18, height: 7, max: Number(maxAttribute) }])}>+ Ajouter une zone manuellement</button>
							</div>
						</div>
					</div>

					{error && <p className="form-error">{error}</p>}
					<div className="modal-actions">
						<button type="button" className="outline-button" onClick={onCancel}>Annuler</button>
						<button type="submit" className="primary-button">{campaign ? 'Enregistrer les changements' : 'Créer la campagne'} <span>↗</span></button>
					</div>
				</form>
			</section>
			{isSheetExpanded && sheet?.data && <div className="sheet-expanded-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setIsSheetExpanded(false)}><section className="sheet-expanded-modal" role="dialog" aria-modal="true" aria-label="Éditeur agrandi de la feuille"><div className="sheet-expanded-header"><div><p className="eyebrow">Placement précis</p><h2>{sheet.name}</h2><p className="muted">Cliquez sur la feuille pour ajouter une zone. Utilisez le bouton ↕ pour déplacer et l’angle pour redimensionner.</p></div><button type="button" className="icon-button" onClick={() => setIsSheetExpanded(false)} aria-label="Fermer l’aperçu agrandi">×</button></div><SheetDesignerPreview sheet={sheet} zones={zones} onAddZone={addZone} onResize={resizeZone} onMove={moveZone} /></section></div>}
		</div>
	)
}

function CharacterEditor({ character: initialCharacter, campaign, onCancel, onSave }) {
	const availableAttributes = campaign.characterTemplate?.attributes || initialCharacter.stats.map(([name]) => name)
	const maxAttribute = campaign.characterTemplate?.maxAttribute || 20
	const [form, setForm] = useState(() => ({
		name: initialCharacter.name,
		className: initialCharacter.className,
		quote: initialCharacter.quote,
		stats: Object.fromEntries(initialCharacter.stats.map(([name, value]) => [name, value])),
	}))
	const sheet = campaign.characterTemplate?.sheet
	const zones = campaign.characterTemplate?.zones || []
	const [sheetValues, setSheetValues] = useState(initialCharacter.sheetValues || {})

	const updateStat = (attribute, value) => {
		setForm((current) => ({ ...current, stats: { ...current.stats, [attribute]: value } }))
	}

	const updateSheetValue = (zoneId, value) => setSheetValues((current) => ({ ...current, [zoneId]: value }))

	const submit = (event) => {
		event.preventDefault()
		onSave({
			...initialCharacter,
			name: form.name,
			className: form.className,
			quote: form.quote,
			stats: availableAttributes.map((attribute) => [attribute, form.stats[attribute] || '0', '']),
			sheetValues,
		})
	}

	return (
		<div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
			<section className="creation-modal character-editor" role="dialog" aria-modal="true" aria-labelledby="character-editor-title">
				<div className="modal-heading">
					<div>
						<p className="eyebrow">Fiche de personnage</p>
						<h2 id="character-editor-title">Modifier {initialCharacter.name}</h2>
						<p className="muted">Les valeurs sont limitées à {maxAttribute} selon le modèle du MJ.</p>
					</div>
					<button type="button" className="icon-button" onClick={onCancel} aria-label="Fermer">×</button>
				</div>

				<form className="creation-form" onSubmit={submit}>
					<div className="form-grid">
						<label>Nom du personnage<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></label>
						<label>Classe / concept<input value={form.className} onChange={(event) => setForm((current) => ({ ...current, className: event.target.value }))} required /></label>
					</div>
					<label className="editor-label">Phrase du personnage<textarea value={form.quote} onChange={(event) => setForm((current) => ({ ...current, quote: event.target.value }))} /></label>
					<p className="form-section-title editor-section-title">Caractéristiques disponibles</p>
					<div className="character-stat-editor">
						{availableAttributes.map((attribute) => (
							<label key={attribute}>{attribute}<input type="number" min="0" max={maxAttribute} value={form.stats[attribute] || ''} onChange={(event) => updateStat(attribute, event.target.value)} required /></label>
						))}
					</div>
					{zones.length > 0 && <div className="player-sheet-fields">
						<p className="form-section-title editor-section-title">Zones de la feuille</p>
						{sheet?.data ? <CharacterSheetPreview sheet={sheet} zones={zones} values={sheetValues} maxAttribute={maxAttribute} onChange={updateSheetValue} /> : <div className="pdf-fields">{zones.map((zone) => <label key={zone.id}>{zone.label}{zone.type === 'checkbox' ? <input type="checkbox" checked={Boolean(sheetValues[zone.id])} onChange={(event) => updateSheetValue(zone.id, event.target.checked)} /> : <input type="number" max={zone.max || maxAttribute} value={sheetValues[zone.id] || ''} onChange={(event) => updateSheetValue(zone.id, event.target.value)} />}</label>)}</div>}
					</div>}
					<div className="modal-actions">
						<button type="button" className="outline-button" onClick={onCancel}>Annuler</button>
						<button type="submit" className="primary-button">Enregistrer la fiche <span>↗</span></button>
					</div>
				</form>
			</section>
		</div>
	)
}

function ItemEditor({ items, onCancel, onSave }) {
	const [form, setForm] = useState({ name: '', type: 'Objet', icon: '✦' })

	const submit = (event) => {
		event.preventDefault()
		if (items.some(([name]) => name.toLowerCase() === form.name.trim().toLowerCase())) return
		onSave([form.name.trim(), form.type, form.icon])
	}

	return (
		<div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
			<section className="creation-modal item-editor" role="dialog" aria-modal="true" aria-labelledby="item-editor-title">
				<div className="modal-heading">
					<div><p className="eyebrow">Équipement</p><h2 id="item-editor-title">Ajouter un objet</h2><p className="muted">Ajoutez un élément à votre inventaire.</p></div>
					<button type="button" className="icon-button" onClick={onCancel} aria-label="Fermer">×</button>
				</div>
				<form className="creation-form" onSubmit={submit}>
					<label className="editor-label">Nom de l’objet<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required placeholder="Ex. Pierre de lune" /></label>
					<label className="editor-label">Type<input value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} required /></label>
					<label className="editor-label">Symbole<input value={form.icon} onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))} maxLength="2" required /></label>
					<div className="modal-actions"><button type="button" className="outline-button" onClick={onCancel}>Annuler</button><button type="submit" className="primary-button">Ajouter l’objet <span>↗</span></button></div>
				</form>
			</section>
		</div>
	)
}

function Sidebar({ screen, role, user, onHome, onCampaign, onLogout }) {
	return (
		<aside className="sidebar">
			<button className="brand brand-button" type="button" onClick={onHome}>
				<Mark>✦</Mark>
				<span>ARCADES</span>
			</button>

			<div className="sidebar-content">
				<p className="nav-label">Navigation</p>

				<nav>
					<button className={screen === 'dashboard' ? 'nav-item active' : 'nav-item'} type="button" onClick={onHome}>
						<span>⌂</span> Tableau de bord
					</button>
					<button className={screen === 'campaign' ? 'nav-item active' : 'nav-item'} type="button" onClick={onCampaign}>
						<span>◈</span> Mes campagnes <b>2</b>
					</button>
					<button type="button" className="nav-item">
						<span>♧</span> Communauté
					</button>
				</nav>

				<p className="nav-label table-label">Ma table</p>
				<button type="button" className="table-link" onClick={onCampaign}>
					<i className="campaign-dot teal-dot" /> Les Brumes de Valombre
				</button>
				<button type="button" className="table-link" onClick={onCampaign}>
					<i className="campaign-dot gold-dot" /> Les Cendres du Roi
				</button>
			</div>

			<div className="sidebar-bottom">
				<button type="button" className="nav-item">
					<span>⚙</span> Paramètres
				</button>

				<button type="button" className="profile" onClick={onLogout}>
					<span className="avatar">{user.initials}</span>
					<span>
						<strong>{user.name}</strong>
						<small>{user.label}</small>
					</span>
					<span className="more">•••</span>
				</button>
			</div>
		</aside>
	)
}

function Dashboard({ isGm, campaigns: availableCampaigns, user, onOpen, onCreate, onRespond }) {
	const pendingInvitations = availableCampaigns.filter((item) => item.invitationStatuses?.[user.id] === 'pending')

	return (
		<div className="page-content dashboard-page">
			<div className="page-heading">
				<div>
					<p className="eyebrow">Dimanche 15 septembre 2024</p>
					<h1>Bonjour, Elyra<span className="accent">.</span></h1>
					<p className="muted">Vos histoires sont prêtes à continuer.</p>
				</div>

				<button className="primary-button small" type="button" onClick={isGm ? onCreate : undefined}>
					{isGm ? '+ Nouvelle campagne' : '+ Rejoindre une table'}
				</button>
			</div>

			<div className="notice">
				<span className="notice-icon">✦</span>
				<div>
					<strong>Prochaine session dans 02:14:36</strong>
					<p>Les Brumes de Valombre · Ce soir à 20:30</p>
				</div>
				<button type="button" className="outline-button" onClick={() => onOpen(campaigns[0])}>Voir la session <span>→</span></button>
			</div>

			{!isGm && pendingInvitations.length > 0 && <InvitationPanel invitations={pendingInvitations} onOpen={onOpen} onRespond={onRespond} />}

			<div className="section-heading">
				<h2>Vos campagnes</h2>
				<button type="button" className="text-button">Voir tout <span>→</span></button>
			</div>

			<div className="campaign-grid">
				{availableCampaigns.map((item) => (
					<button key={item.id} type="button" className="campaign-card" onClick={() => onOpen(item)}>
						<div className={`card-art ${item.tone}`}>
							<span>{item.tone === 'teal' ? '◌' : '✧'}</span>
							<small>{item.system}</small>
						</div>
						<div className="card-info">
							<div>
								<h3>{item.title}</h3>
								<p>{item.progress} <span>·</span> {item.players} aventuriers</p>
							</div>
							<span className="arrow">↗</span>
						</div>
						<div className="card-meta">
							<span><i className="live-dot" /> {item.next}</span>
							<span>{item.place}</span>
						</div>
					</button>
				))}
			</div>

			<div className="lower-grid">
				<div className="activity-panel">
					<div className="section-heading">
						<h2>Dernières nouvelles</h2>
						<button type="button" className="text-button">Tout voir</button>
					</div>
					<Activity icon="✦" title="Le MJ a mis à jour le résumé" detail="Les Brumes de Valombre · il y a 2 h" />
					<Activity icon="◈" title="Nouvel objet ajouté à l’inventaire" detail="Les Cendres du Roi · hier" />
				</div>

				<div className="quote-panel">
					<span className="quote-mark">“</span>
					<p>Les meilleurs récits sont ceux que l’on écrit à plusieurs.</p>
					<small>— Le manifeste d’Arcades</small>
				</div>
			</div>
		</div>
	)
}

function InvitationPanel({ invitations, onOpen, onRespond }) {
	return (
		<section className="invitation-panel">
			<div className="panel-heading">
				<div>
					<p className="eyebrow">À vous de jouer</p>
					<h2>Invitations en attente</h2>
				</div>
				<span className="online-count">{invitations.length} nouvelle{invitations.length > 1 ? 's' : ''}</span>
			</div>
			{invitations.map((item) => (
				<div className="invitation-row" key={item.id}>
					<div>
						<strong>{item.title}</strong>
						<p>{item.system} · {item.pace || 'Rythme à définir'} · {item.maxPlayers || '—'} joueurs maximum</p>
					</div>
					<div className="invitation-actions">
						<button type="button" className="text-button" onClick={() => onRespond(item.id, 'declined')}>Refuser</button>
						<button type="button" className="primary-button small" onClick={() => onRespond(item.id, 'accepted')}>Accepter</button>
						<button type="button" className="icon-button" onClick={() => onOpen(item)} aria-label={`Voir ${item.title}`}>↗</button>
					</div>
				</div>
			))}
		</section>
	)
}

const Activity = ({ icon, title, detail }) => (
	<div className="activity">
		<span className="activity-mark">{icon}</span>
		<div>
			<strong>{title}</strong>
			<p>{detail}</p>
		</div>
	</div>
)

function CampaignView({ isGm, campaign, character, user, tab, setTab, messages, message, setMessage, sendMessage, onEdit, onDelete, onEditCharacter, onAddItem, onRemoveItem, onUpdateCampaign, onRespondToSession }) {
	const tabs = isGm
		? [
				['overview', 'Vue d’ensemble'],
				['players', 'Personnages (5)'],
				['sessions', 'Sessions'],
				['journal', 'Journal'],
				['messages', 'Messages'],
			]
		: [
				['character', 'Personnage'],
				['inventory', 'Inventaire'],
				['story', 'Résumé de l’histoire'],
			]

	return (
		<div className="page-content campaign-page">
			<div className="campaign-heading">
				<div>
					<button type="button" className="back-button" onClick={() => setTab('character')}>← Toutes les campagnes</button>
					<p className="eyebrow">Campagne active · {campaign.system}</p>
					<h1>{campaign.title}</h1>
					<p className="muted">Chapitre III : Le phare sous la tourbe</p>
				</div>

				<div className="session-status">
					<i className="live-dot" /> En cours
					{isGm && <button type="button" className="icon-button" onClick={onEdit} aria-label="Modifier la campagne">✎</button>}
					{isGm && <button type="button" className="icon-button danger-icon" onClick={onDelete} aria-label="Supprimer la campagne">×</button>}
				</div>
			</div>

			<div className="campaign-tabs">
				{tabs.map(([id, label]) => (
					<button key={id} type="button" className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>{label}</button>
				))}
			</div>

			{isGm ? <GmContent campaign={campaign} tab={tab} messages={messages} message={message} setMessage={setMessage} sendMessage={sendMessage} onUpdateCampaign={onUpdateCampaign} /> : <PlayerContent character={character} campaign={campaign} user={user} tab={tab} onEdit={onEditCharacter} onAddItem={onAddItem} onRemoveItem={onRemoveItem} onRespondToSession={onRespondToSession} />}
		</div>
	)
}

function PlayerContent({ character, campaign, user, tab, onEdit, onAddItem, onRemoveItem, onRespondToSession }) {
	const nextSession = (campaign.sessions || []).find((session) => session.status === 'planned')
		|| (campaign.sessionDate ? { date: campaign.sessionDate, time: campaign.sessionTime, place: campaign.sessionPlace || campaign.place } : null)
	const attendance = nextSession?.attendance?.[user.id]

	if (tab === 'inventory') {
		return (
			<div className="content-grid">
				<section className="paper-panel">
					<div className="panel-heading">
						<div>
							<p className="eyebrow">Équipement</p>
							<h2>Inventaire d’Elyra</h2>
						</div>
						<span className="capacity">{character.items.length} / 20 emplacements</span>
					</div>

					{character.items.map(([name, type, icon]) => (
						<div className="inventory-item" key={name}>
							<span className="item-icon">{icon}</span>
							<div>
								<strong>{name}</strong>
								<small>{type}</small>
							</div>
							<button type="button" className="icon-button danger-icon" onClick={() => onRemoveItem(name)} aria-label={`Retirer ${name}`}>×</button>
						</div>
					))}

					<button type="button" className="outline-button full-width" onClick={onAddItem}>+ Ajouter un objet</button>
				</section>

				<aside className="side-note">
					<p className="eyebrow">Notes personnelles</p>
					<p>Ne pas oublier de demander à Soren ce qu’il a vu près du vieux pont.</p>
					<button type="button" className="text-button">Modifier la note ✎</button>
				</aside>
			</div>
		)
	}

	if (tab === 'story') {
		return (
			<section className="story-panel">
				<p className="eyebrow">Le carnet du maître de jeu</p>
				<h2>{campaign.storyTitle || 'Le phare sous la tourbe'}</h2>
				<p className="story-lead">{campaign.storyLead || 'La brume s’est levée pour la première fois depuis trois semaines. Au bord du lac noir, les lanternes du phare se sont rallumées une à une.'}</p>
				<p>{campaign.storyText || 'Vous avez retrouvé la trace de la cartographe disparue dans les fondations de l’ancienne tour. Ce qu’elle y cherchait reste encore un mystère, mais les symboles gravés sur les pierres ressemblent étrangement à ceux de votre grimoire.'}</p>
				<blockquote>« {campaign.storyQuote || 'Quand la dernière lumière s’éteindra, la porte se souviendra de vos noms.'} »</blockquote>
				<div className="story-footer">
					<span>Mis à jour par Maître Orin · il y a 2 h</span>
					<button type="button" className="text-button">Voir les chapitres précédents →</button>
				</div>
			</section>
		)
	}

	return (
		<div className="character-layout">
			<section className="character-sheet">
				<div className="character-hero">
					<div className="portrait">EV<span>✦</span></div>
					<div>
						<p className="eyebrow">Fiche de personnage</p>
						<h2>{character.name}</h2>
						<p>{character.className} <span>·</span> Niveau {character.level}</p>
					</div>
					<button type="button" className="outline-button edit-button" onClick={onEdit}>Modifier</button>
				</div>

				<div className="quote">“{character.quote}”</div>

				<div className="stat-row">
					{character.stats.map(([name, value, modifier]) => (
						<div className="stat" key={name}>
							<small>{name}</small>
							<strong>{value}</strong>
							<span>{modifier}</span>
						</div>
					))}
				</div>
			</section>

			<aside className="session-card">
				<p className="eyebrow">Prochaine session</p>
				<h3>{campaign.sessionTitle || campaign.title}</h3>
				<div className="session-date">
					<strong>{nextSession?.time || '—'}</strong>
					<span>{nextSession?.date ? new Date(`${nextSession.date}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' }) : 'Date à définir'}</span>
				</div>
				<div className="session-divider" />
				<p><span className="live-dot" /> {nextSession?.place || campaign.place || 'Lieu à définir'}</p>
				<div className="attendance-actions"><span className="attendance-label">{attendance === 'present' ? 'Présence confirmée' : attendance === 'absent' ? 'Absence signalée' : 'Votre présence ?'}</span><button type="button" className={attendance === 'present' ? 'attendance-button selected' : 'attendance-button'} onClick={() => nextSession && onRespondToSession(nextSession.id, 'present')}>Présent</button><button type="button" className={attendance === 'absent' ? 'attendance-button selected absent' : 'attendance-button'} onClick={() => nextSession && onRespondToSession(nextSession.id, 'absent')}>Absent</button></div>
				<button type="button" className="primary-button full-width">Rejoindre la session ↗</button>
			</aside>
		</div>
	)
}

function JournalEditor({ campaign, onUpdateCampaign }) {
	const [form, setForm] = useState({
		storyTitle: campaign.storyTitle || 'Le phare sous la tourbe',
		storyLead: campaign.storyLead || '',
		storyText: campaign.storyText || '',
		storyQuote: campaign.storyQuote || '',
	})
	const [saved, setSaved] = useState(false)

	const updateField = (event) => {
		const { name, value } = event.target
		setForm((current) => ({ ...current, [name]: value }))
		setSaved(false)
	}

	const submit = (event) => {
		event.preventDefault()
		onUpdateCampaign(form)
		setSaved(true)
	}

	return (
		<section className="story-editor paper-panel">
			<div className="panel-heading">
				<div><p className="eyebrow">Notes du maître de jeu</p><h2>Journal de campagne</h2></div>
				{saved && <span className="save-confirmation">Enregistré</span>}
			</div>
			<form className="journal-form" onSubmit={submit}>
				<label>Titre du chapitre<input name="storyTitle" value={form.storyTitle} onChange={updateField} required /></label>
				<label>Introduction<textarea name="storyLead" value={form.storyLead} onChange={updateField} required placeholder="Posez le décor de la prochaine scène..." /></label>
				<label>Résumé<textarea name="storyText" value={form.storyText} onChange={updateField} required placeholder="Notez les événements importants..." /></label>
				<label>Citation ou indice<textarea name="storyQuote" value={form.storyQuote} onChange={updateField} required placeholder="Une phrase que les joueurs doivent retenir..." /></label>
				<div className="modal-actions"><button type="submit" className="primary-button">Publier dans le journal <span>↗</span></button></div>
			</form>
		</section>
	)
}

function GmContent({ campaign, tab, messages, message, setMessage, sendMessage, onUpdateCampaign }) {
	const memberIds = [...new Set([...(campaign.members || []), ...(campaign.invitedUserIds || [])])]
	const people = [...Object.values(users), ...friends]

	if (tab === 'messages') {
		return (
			<section className="messages-panel">
				<div className="panel-heading">
					<div>
						<p className="eyebrow">Canal de campagne</p>
						<h2>Messages de la table</h2>
					</div>
					<span className="online-count">● 5 en ligne</span>
				</div>

				<div className="messages-list">
					{messages.map(([author, text, time], index) => (
						<div className="message" key={`${author}-${index}`}>
							<span className="avatar small-avatar">{author === 'MJ' ? 'MJ' : author === 'Milo' ? 'ML' : 'EV'}</span>
							<div>
								<div>
									<strong>{author}</strong>
									<small>{time}</small>
								</div>
								<p>{text}</p>
							</div>
						</div>
					))}
				</div>

				<form className="message-form" onSubmit={sendMessage}>
					<input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Écrire un message à la table..." />
					<button className="primary-button" type="submit">Envoyer ↗</button>
				</form>
			</section>
		)
	}

	if (tab === 'journal') {
		return <JournalEditor campaign={campaign} onUpdateCampaign={onUpdateCampaign} />
	}

	if (tab === 'sessions') {
		return <SessionManager campaign={campaign} onUpdateCampaign={onUpdateCampaign} />
	}

	return (
		<div className="gm-layout">
			<section className="paper-panel">
				<div className="panel-heading">
					<div>
						<p className="eyebrow">Gestion de la table</p>
						<h2>{tab === 'players' ? 'Personnages des joueurs' : 'Vue d’ensemble'}</h2>
					</div>
					<button type="button" className="outline-button">+ Ajouter</button>
				</div>

				{tab === 'players' ? (
					<div className="player-list">
						{memberIds.map((id) => {
							const person = people.find((item) => item.id === id) || { id, initials: '??', name: id, detail: 'Utilisateur' }
							const invitationStatus = campaign.invitationStatuses?.[id]
							const status = invitationStatus === 'pending' ? 'Invitation en attente' : invitationStatus === 'declined' ? 'Invitation refusée' : 'En ligne'
							return (
							<div className="player-row" key={id}>
								<span className="avatar">{person.initials}</span>
								<div>
									<strong>{person.name}</strong>
									<small>{person.detail}</small>
								</div>
								<span className={status === 'En ligne' ? 'player-status online' : 'player-status'}>{status}</span>
								<button type="button" className="text-button">Modifier</button>
							</div>
							)
						})}
					</div>
				) : (
					<>
					<div className="gm-overview">
						<div className="gm-stat"><span>Sessions jouées</span><strong>18</strong><small>+2 ce mois-ci</small></div>
						<div className="gm-stat"><span>Notes de campagne</span><strong>42</strong><small>Dernière : il y a 2 h</small></div>
						<div className="gm-stat"><span>Joueurs invités</span><strong>{campaign.invitedFriends?.length || 0}</strong><small>sur {campaign.maxPlayers || '—'} places</small></div>
					</div>
					<div className="campaign-facts">
						<div><span>Prochaine session</span><strong>{campaign.next || 'Date à définir'}</strong></div>
						<div><span>Lieu / salon</span><strong>{campaign.sessionPlace || campaign.place || 'À définir'}</strong></div>
						<div><span>Rythme</span><strong>{campaign.pace || 'Non défini'}</strong></div>
						<div><span>Suppléants</span><strong>{campaign.substitutes ?? '—'}</strong></div>
						<div><span>Caractéristiques</span><strong>{campaign.characterTemplate?.attributes?.join(' · ') || 'Non défini'}</strong></div>
					</div>
					{campaign.invitedFriends?.length > 0 && <p className="invited-summary"><strong>Invités :</strong> {campaign.invitedFriends.join(', ')}</p>}
					</>
				)}
			</section>

			<aside className="gm-side">
				<div className="mini-map">
					<span>◈</span>
					<p>Carte de Valombre</p>
					<small>Dernière mise à jour · hier</small>
				</div>
				<button type="button" className="outline-button full-width">Ouvrir le journal de campagne</button>
			</aside>
		</div>
	)
}

function SessionManager({ campaign, onUpdateCampaign }) {
	const [form, setForm] = useState({ date: '', time: '', place: '' })
	const sessions = campaign.sessions || []

	const addSession = (event) => {
		event.preventDefault()
		const newSession = { id: `session-${Date.now()}`, ...form, status: 'planned' }
		onUpdateCampaign({ sessions: [...sessions, newSession] })
		setForm({ date: '', time: '', place: '' })
	}

	const updateStatus = (sessionId, status) => {
		onUpdateCampaign({ sessions: sessions.map((session) => session.id === sessionId ? { ...session, status } : session) })
	}

	return (
		<div className="session-manager">
			<section className="paper-panel">
				<div className="panel-heading"><div><p className="eyebrow">Calendrier de la table</p><h2>Sessions de jeu</h2></div><span className="capacity">{sessions.length} session{sessions.length > 1 ? 's' : ''}</span></div>
				<div className="session-list">
					{sessions.length === 0 && <p className="muted">Aucune session planifiée pour le moment.</p>}
					{sessions.map((session) => (
						<div className="scheduled-session" key={session.id}>
							<div className="session-date-badge"><strong>{session.date ? new Date(`${session.date}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—'}</strong><span>{session.time || 'Heure à définir'}</span></div>
							<div className="scheduled-session-info"><strong>{session.place || 'Lieu à définir'}</strong><small>{session.status === 'done' ? 'Terminée' : session.status === 'cancelled' ? 'Annulée' : 'Planifiée'}</small></div>
							{session.attendance && <span className="attendance-summary">{Object.values(session.attendance).filter((value) => value === 'present').length} présent(s)</span>}
							<select value={session.status} onChange={(event) => updateStatus(session.id, event.target.value)} aria-label="Statut de la session"><option value="planned">Planifiée</option><option value="done">Terminée</option><option value="cancelled">Annulée</option></select>
						</div>
					))}
				</div>
			</section>
			<section className="paper-panel session-add-panel">
				<div className="panel-heading"><div><p className="eyebrow">Nouvelle date</p><h2>Planifier une session</h2></div></div>
				<form className="session-form" onSubmit={addSession}>
					<label>Date<input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} required /></label>
					<label>Heure<input type="time" value={form.time} onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))} required /></label>
					<label>Lieu ou salon vocal<input value={form.place} onChange={(event) => setForm((current) => ({ ...current, place: event.target.value }))} required placeholder="Salon vocal 01" /></label>
					<button type="submit" className="primary-button full-width">Ajouter la session <span>↗</span></button>
				</form>
			</section>
		</div>
	)
}

export default App
