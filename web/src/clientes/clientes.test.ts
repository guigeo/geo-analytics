// O critério de saída da fase 2, escrito como teste: a mesma base produz duas
// aplicações diferentes, e o recorte de camadas de um cliente não tem efeito
// nenhum sobre o outro.
import { describe, expect, it } from "vitest";
import { cliente as geoAnalytics } from "./geo-analytics";
import { cliente as ebPrime } from "./eb-prime";
import { CATALOGO } from "@/configuracao/catalogo";

const ids = (c: { camadas: { id: string }[] }) => c.camadas.map((camada) => camada.id);

describe("os dois clientes", () => {
  it("têm identidades diferentes", () => {
    expect(geoAnalytics.id).not.toBe(ebPrime.id);
    expect(geoAnalytics.identidade.nome).not.toBe(ebPrime.identidade.nome);
  });

  it("enxergam recortes diferentes do catálogo", () => {
    expect(ids(geoAnalytics)).not.toEqual(ids(ebPrime));
  });

  it("só escolhem camada que existe no catálogo", () => {
    const doCatalogo = new Set(Object.keys(CATALOGO));
    for (const c of [geoAnalytics, ebPrime]) {
      for (const id of ids(c)) {
        expect(doCatalogo, `cliente ${c.id}`).toContain(id);
      }
    }
  });

  it("o cliente 1 enxerga o catálogo inteiro", () => {
    expect(ids(geoAnalytics).sort()).toEqual(Object.keys(CATALOGO).sort());
  });

  it("tirar camada de um cliente não tira do outro", () => {
    // O recorte do EB Prime não tem rodovias, antenas nem ferrovias; as três
    // continuam no cliente 1. É esta linha que prova que o recorte é por
    // cliente, e não uma edição na lista global.
    for (const ausente of ["rodovias", "antenas", "ferrovias"]) {
      expect(ids(ebPrime)).not.toContain(ausente);
      expect(ids(geoAnalytics)).toContain(ausente);
    }
  });

  it("nenhuma camada do EB Prime nasce ligada", () => {
    // Pedido do Gui em 2026-08-29: quem usa escolhe o nível ao entrar, em vez de
    // achar o mapa já com município desenhado por cima.
    for (const c of ebPrime.camadas) {
      expect(c.visivelPorPadrao, `camada ${c.id}`).toBe(false);
    }
  });

  it("ajuste de cliente não vaza para o catálogo", () => {
    // O EB Prime repinta o setor. O catálogo — e portanto o cliente 1 — precisa
    // continuar com a cor original: `com()` copia, não muda no lugar.
    const setorDele = ebPrime.camadas.find((c) => c.id === "setor");
    expect(setorDele?.cor).toBe("#1f6f8b");
    expect(CATALOGO.setor.cor).toBe("#e08a3c");
    expect(geoAnalytics.camadas.find((c) => c.id === "setor")?.cor).toBe("#e08a3c");
  });
});
