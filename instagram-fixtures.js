(function (root, factory) {
    const fixtures = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = fixtures;
    }
    root.MARYILU_INSTAGRAM_FIXTURES = fixtures;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    const simulatedInstagramMedia = [
        {
            id: "sim_maryilu_priced_chest",
            caption: "Available hand-painted keepsake chest, price 250 euros. Custom colors possible. Mallorca pickup or shipping by quote. #maryilu #gift",
            mediaUrl: "assets/maryilu-luxury-chest-hero.png",
            simulated: true,
            timestamp: "2026-06-22T08:00:00Z",
            username: "marialuisas_arttt"
        },
        {
            id: "sim_maryilu_spanish_chest",
            caption: "Disponible cofre personalizado precio 250 euros. Envio aparte y recogida en Mallorca. #maryilu #cofre",
            mediaUrl: "assets/maryilu-luxury-chest-hero.png",
            simulated: true,
            timestamp: "2026-06-22T08:03:00Z",
            username: "marialuisas_arttt"
        },
        {
            id: "sim_maryilu_process_bouquet",
            caption: "Studio process for a ribbon color study. DM for custom requests and colors. #maryilu #flowers",
            mediaUrl: "assets/maryilu-editorial-store-hero.png",
            simulated: true,
            timestamp: "2026-06-22T08:05:00Z",
            username: "marialuisas_arttt"
        }
    ];

    return {
        simulatedInstagramMedia
    };
});
