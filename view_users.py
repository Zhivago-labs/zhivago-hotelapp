import sqlite3
import os

def main():
    # Caminho para o banco de dados SQLite
    db_path = os.path.join("server", "prisma", "prisma", "dev.db")
    
    if not os.path.exists(db_path):
        print(f"Erro: O banco de dados não foi encontrado em {db_path}")
        return

    try:
        # Conectando ao banco de dados
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Buscando os usuários
        print("--- DADOS DOS USUÁRIOS NO BANCO DE DADOS ---")
        cursor.execute("SELECT id, name, email, role, status, createdAt FROM User")
        users = cursor.fetchall()

        if not users:
            print("Nenhum usuário encontrado.")
        else:
            # Imprimindo o cabeçalho
            print(f"{'ID':<38} | {'NOME':<20} | {'EMAIL':<30} | {'ROLE':<10} | {'STATUS':<10} | {'CRIADO EM'}")
            print("-" * 140)
            
            # Imprimindo cada usuário
            for user in users:
                user_id = str(user[0])
                name = str(user[1])
                email = str(user[2])
                role = str(user[3])
                status = str(user[4])
                # Formatando a data
                created_at = str(user[5])
                
                print(f"{user_id:<38} | {name:<20} | {email:<30} | {role:<10} | {status:<10} | {created_at}")

        print("\n--- RESUMO DE IMÓVEIS (Listings) ---")
        cursor.execute("SELECT id, name, price, type, status, ownerId FROM Listing")
        listings = cursor.fetchall()
        
        if not listings:
            print("Nenhum imóvel encontrado.")
        else:
            print(f"{'ID':<38} | {'NOME':<30} | {'PREÇO':<10} | {'TIPO':<12} | {'STATUS':<10} | {'OWNER_ID'}")
            print("-" * 140)
            for listing in listings:
                list_id = str(listing[0])
                name = str(listing[1])[:30] # truncar se for muito longo
                price = str(listing[2])
                type_ = str(listing[3])
                status = str(listing[4])
                owner_id = str(listing[5]) if listing[5] else "Sem Dono"
                
                print(f"{list_id:<38} | {name:<30} | R$ {price:<7} | {type_:<12} | {status:<10} | {owner_id}")

    except sqlite3.Error as e:
        print(f"Erro ao acessar o banco de dados: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    main()
