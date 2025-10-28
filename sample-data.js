// Sample artworks data for demonstration
const sampleArtworks = [
    {
        id: 1,
        title: "Sunset Dreams",
        year: 2024,
        medium: "Oil on Canvas",
        size: "24x36 inches",
        description: "A vibrant exploration of color and light, capturing the ethereal beauty of a sunset over rolling hills. This piece represents the artist's fascination with the interplay between natural light and emotional response.",
        price: 2500,
        imageUrl: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImdyYWQiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNmZjY2MDA7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSI1MCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNmZmNjMDA7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojNjY5OWZmO3N0b3Atb3BhY2l0eToxIiAvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JhZCkiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE4IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPlN1bnNldCBEcmVhbXM8L3RleHQ+PC9zdmc+",
        createdAt: "2024-01-15T10:00:00Z"
    },
    {
        id: 2,
        title: "Urban Reflections",
        year: 2024,
        medium: "Acrylic on Canvas",
        size: "30x40 inches",
        description: "An abstract interpretation of city life, featuring bold geometric shapes and vibrant colors that reflect the energy and complexity of urban environments. The piece explores themes of movement, connection, and the human experience in modern society.",
        price: 1800,
        imageUrl: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHJlY3QgeD0iMjAlIiB5PSIxMCUiIHdpZHRoPSI2MCUiIGhlaWdodD0iODAlIiBmaWxsPSIjNjY2Ii8+PHJlY3QgeD0iMzAlIiB5PSIyMCUiIHdpZHRoPSI0MCUiIGhlaWdodD0iNjAlIiBmaWxsPSIjOTk5Ii8+PHJlY3QgeD0iNDAlIiB5PSIzMCUiIHdpZHRoPSIyMCUiIGhlaWdodD0iNDAlIiBmaWxsPSIjY2NjIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzMzMyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPlVyYmFuIFJlZmxlY3Rpb25zPC90ZXh0Pjwvc3ZnPg==",
        createdAt: "2024-02-20T14:30:00Z"
    },
    {
        id: 3,
        title: "Nature's Symphony",
        year: 2023,
        medium: "Mixed Media",
        size: "36x48 inches",
        description: "A complex composition combining watercolor, ink, and collage elements to create a rich tapestry of natural forms. This piece celebrates the intricate beauty of the natural world through layered textures and organic shapes.",
        price: 3200,
        imageUrl: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Im5hdHVyZSIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3R5bGU9InN0b3AtY29sb3I6IzI3YWU2MDtzdG9wLW9wYWNpdHk6MSIgLz48c3RvcCBvZmZzZXQ9IjUwJSIgc3R5bGU9InN0b3AtY29sb3I6IzJjYzM1MDtzdG9wLW9wYWNpdHk6MSIgLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiMxNjM5NTM7c3RvcC1vcGFjaXR5OjEiIC8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNuYXR1cmUpIi8+PGNpcmNsZSBjeD0iMjAlIiBjeT0iMzAlIiByPSIxNSUiIGZpbGw9IiNmZmZmZmYiIG9wYWNpdHk9IjAuNyIvPjxjaXJjbGUgY3g9IjgwJSIgY3k9IjIwJSIgcj0iMTAlIiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIwLjUiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE4IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5hdHVyZSdzIFN5bXBob255PC90ZXh0Pjwvc3ZnPg==",
        createdAt: "2023-11-10T09:15:00Z"
    },
    {
        id: 4,
        title: "Abstract Emotions",
        year: 2023,
        medium: "Oil on Canvas",
        size: "20x24 inches",
        description: "A deeply personal exploration of emotional states through abstract forms and colors. This intimate piece reflects the artist's journey through different emotional landscapes, using color and texture to convey complex feelings.",
        price: 0, // Not for sale
        imageUrl: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImVtb3Rpb25zIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj48c3RvcCBvZmZzZXQ9IjAlIiBzdHlsZT0ic3RvcC1jb2xvcjojZTc0YzNjO3N0b3Atb3BhY2l0eToxIiAvPjxzdG9wIG9mZnNldD0iMzAlIiBzdHlsZT0ic3RvcC1jb2xvcjojOWI1OWQ2O3N0b3Atb3BhY2l0eToxIiAvPjxzdG9wIG9mZnNldD0iNzAlIiBzdHlsZT0ic3RvcC1jb2xvcjojMzQ5OGRiO3N0b3Atb3BhY2l0eToxIiAvPjxzdG9wIG9mZnNldD0iMTAwJSIgc3R5bGU9InN0b3AtY29sb3I6IzY2N2VlYTtzdG9wLW9wYWNpdHk6MSIgLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2Vtb3Rpb25zKSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+QWJzdHJhY3QgRW1vdGlvbnM8L3RleHQ+PC9zdmc+",
        createdAt: "2023-08-05T16:45:00Z"
    }
];

// Initialize sample data if no artworks exist
document.addEventListener('DOMContentLoaded', () => {
    const existingArtworks = JSON.parse(localStorage.getItem('artworks')) || [];
    if (existingArtworks.length === 0) {
        localStorage.setItem('artworks', JSON.stringify(sampleArtworks));
        console.log('Sample artworks loaded');
    }
});
