import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";

type Place = {
  name: string;
  type: string;
  position: [number, number];
  rating: number;
};

type SearchPosition = {
  coords: [number, number];
  zoom: number;
};

export default function InicialScreen() {
  const [leaflet, setLeaflet] = useState<any>(null);

  const [search, setSearch] = useState("");
  const [searchPosition, setSearchPosition] =
    useState<SearchPosition | null>(null);

  const [position, setPosition] = useState<[number, number] | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("");

  // Carrega react-leaflet somente no browser
  useEffect(() => {
    if (typeof window === "undefined") return;

    (async () => {
      const L = await import("react-leaflet");
      setLeaflet(L);
    })();
  }, []);

  // Busca cidade/endereço (OpenStreetMap Nominatim)
  async function buscarCidade() {
    if (!search) return;

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${search}&addressdetails=1`
    );

    const data = await res.json();
    if (data.length === 0) return;

    const place = data[0];
    const lat = parseFloat(place.lat);
    const lon = parseFloat(place.lon);

    let zoom = 12;

    switch (place.type) {
      case "city":
        zoom = 12;
        break;
      case "administrative":
        zoom = 11;
        break;
      case "suburb":
        zoom = 14;
        break;
      case "road":
        zoom = 16;
        break;
      case "house":
        zoom = 17;
        break;
    }

    setSearchPosition({
      coords: [lat, lon],
      zoom,
    });
  }

  if (!leaflet) {
    return <div style={{ padding: 20 }}>Carregando mapa...</div>;
  }

  const {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    useMapEvents,
    useMap,
  } = leaflet;

  // Controlador do mapa (ESSENCIAL)
  function MapController({ data }: { data: SearchPosition }) {
    const map = useMap();

    useEffect(() => {
      map.setView(data.coords, data.zoom, { animate: true });
    }, [data, map]);

    return null;
  }

  // Clique no mapa para adicionar PIN
  function MapClick() {
    useMapEvents({
      click(e: any) {
        setPosition([e.latlng.lat, e.latlng.lng]);
      },
    });
    return null;
  }

  function salvarLugar() {
    if (!position || !name || !type) return;

    setPlaces([
      ...places,
      {
        name,
        type,
        position,
        rating: 5,
      },
    ]);

    setName("");
    setType("");
    setPosition(null);
  }

  return (
    <div style={styles.page}>
      {/* BARRA DE PESQUISA */}
      <div style={styles.searchBar}>
        <input
          placeholder="Pesquisar cidade ou endereço"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />
        <button style={styles.searchButton} onClick={buscarCidade}>
          🔍
        </button>
      </div>

      {/* MAPA */}
      <div style={styles.mapContainer}>
        <MapContainer
          center={[-15.6, -56.1]}
          zoom={5}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="© OpenStreetMap"
          />

          {searchPosition && <MapController data={searchPosition} />}

          <MapClick />

          {position && (
            <Marker position={position}>
              <Popup>Novo local</Popup>
            </Marker>
          )}

          {places.map((p, i) => (
            <Marker key={i} position={p.position}>
              <Popup>
                <strong>{p.name}</strong>
                <br />
                {p.type}
                <br />
                ⭐ {p.rating}
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* FORMULÁRIO FLUTUANTE */}
        {position && (
          <div style={styles.formCard}>
            <h3 style={{ marginBottom: 10 }}>Adicionar Lugar</h3>

            <input
              placeholder="Nome do lugar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.input}
            />

            <input
              placeholder="Tipo (Bike, Parque...)"
              value={type}
              onChange={(e) => setType(e.target.value)}
              style={styles.input}
            />

            <button style={styles.saveButton} onClick={salvarLugar}>
              Salvar Local
            </button>
          </div>
        )}
      </div>

      {/* LISTA */}
      <div style={styles.list}>
        <h3>Lugares Cadastrados</h3>

        {places.length === 0 && (
          <p style={{ color: "#777" }}>
            Clique no mapa para adicionar um local
          </p>
        )}

        {places.map((p, i) => (
          <div key={i} style={styles.listItem}>
            <strong>{p.name}</strong>
            <span>{p.type}</span>
            <span>⭐ {p.rating}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= ESTILOS ================= */

const styles: any = {
  page: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#F4F6F8",
  },

  searchBar: {
    display: "flex",
    padding: 10,
    backgroundColor: "#FFF",
    boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
    zIndex: 1000,
  },

  searchInput: {
    flex: 1,
    padding: 10,
    borderRadius: 6,
    border: "1px solid #CCC",
  },

  searchButton: {
    marginLeft: 8,
    padding: "0 16px",
    borderRadius: 6,
    border: "none",
    backgroundColor: "#1e4db7",
    color: "#FFF",
    cursor: "pointer",
    fontWeight: "bold",
  },

  mapContainer: {
    position: "relative",
    height: "60%",
  },

  formCard: {
    position: "absolute",
    bottom: 20,
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 12,
    width: 280,
    boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
    zIndex: 1000,
  },

  input: {
    width: "100%",
    padding: 8,
    marginBottom: 8,
    borderRadius: 6,
    border: "1px solid #CCC",
  },

  saveButton: {
    width: "100%",
    padding: 10,
    backgroundColor: "#1e4db7",
    color: "#FFF",
    border: "none",
    borderRadius: 6,
    fontWeight: "bold",
    cursor: "pointer",
  },

  list: {
    flex: 1,
    padding: 15,
    backgroundColor: "#FFF",
    overflowY: "auto",
  },

  listItem: {
    display: "flex",
    justifyContent: "space-between",
    padding: 10,
    borderBottom: "1px solid #EEE",
  },
};
