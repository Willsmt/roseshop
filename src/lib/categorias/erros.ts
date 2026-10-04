// Rejeição de um id de categoria que não está na lista atual (FR-014, SC-006).
// Consumidores (003, IA) tratam por `instanceof`; a mensagem não traz o id nem dados do banco.
export class CategoriaInvalidaError extends Error {
  constructor() {
    super("Categoria inválida");
    this.name = "CategoriaInvalidaError";
  }
}
