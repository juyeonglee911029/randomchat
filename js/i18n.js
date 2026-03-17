export const translations = {
    en: {
        find_stranger: "Find Stranger",
        stop: "Stop",
        friends: "Friends",
        settings: "Settings",
        searching: "Searching...",
        connected: "Connected.",
        disconnected: "Disconnected.",
        welcome: "Welcome to YELLOWCHAT. Click 'Find Stranger' to start.",
        pending_requests: "PENDING REQUESTS",
        my_friends: "MY FRIENDS",
        no_friends: "No friends found. Search by ID to add!",
        premium_upgrade: "PREMIUM UPGRADE",
        subscribe_now: "Subscribe Now",
        everyone: "Everyone",
        male_only: "Male Only (Premium)",
        female_only: "Female Only (Premium)"
    },
    es: {
        find_stranger: "Buscar Extraño",
        stop: "Detener",
        friends: "Amigos",
        settings: "Ajustes",
        searching: "Buscando...",
        connected: "Conectado.",
        disconnected: "Desconectado.",
        welcome: "Bienvenido a YELLOWCHAT. Haz clic en 'Buscar Extraño' para empezar.",
        pending_requests: "SOLICITUDES PENDIENTES",
        my_friends: "MIS AMIGOS",
        no_friends: "No se encontraron amigos. ¡Busca por ID para agregar!",
        premium_upgrade: "MEJORA PREMIUM",
        subscribe_now: "Suscribirse Ahora",
        everyone: "Todos",
        male_only: "Solo Hombres (Premium)",
        female_only: "Solo Mujeres (Premium)"
    },
    pt: {
        find_stranger: "Encontrar Estranho",
        stop: "Parar",
        friends: "Amigos",
        settings: "Configurações",
        searching: "Procurando...",
        connected: "Conectado.",
        disconnected: "Desconectado.",
        welcome: "Bem-vindo ao YELLOWCHAT. Clique em 'Encontrar Estranho' para começar.",
        pending_requests: "SOLICITAÇÕES PENDENTES",
        my_friends: "MEUS AMIGOS",
        no_friends: "Nenhum amigo encontrado. Pesquise por ID para adicionar!",
        premium_upgrade: "UPGRADE PREMIUM",
        subscribe_now: "Assine Agora",
        everyone: "Todos",
        male_only: "Apenas Homens (Premium)",
        female_only: "Apenas Mulheres (Premium)"
    }
};

export function getLanguage() {
    const lang = navigator.language || navigator.userLanguage;
    if (lang.startsWith('es')) return 'es';
    if (lang.startsWith('pt')) return 'pt';
    return 'en';
}

export function updateMetaTags(lang) {
    const titles = {
        en: "YELLOWCHAT - Random Video Chat with Strangers",
        es: "YELLOWCHAT - Chat de Video Aleatorio con Extraños",
        pt: "YELLOWCHAT - Video Chat Aleatório com Estranhos"
    };
    const descriptions = {
        en: "Connect instantly with people around the world. Secure, anonymous, and fun random video chat.",
        es: "Conéctate al instante con personas de todo el mundo. Chat de video aleatorio seguro, anónimo y divertido.",
        pt: "Conecte-se instantaneamente com pessoas ao redor do mundo. Video chat aleatório seguro, anônimo e divertido."
    };

    document.title = titles[lang] || titles.en;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
        metaDesc.setAttribute('content', descriptions[lang] || descriptions.en);
    } else {
        const meta = document.createElement('meta');
        meta.name = "description";
        meta.content = descriptions[lang] || descriptions.en;
        document.head.appendChild(meta);
    }
}
