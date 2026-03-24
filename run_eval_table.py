import os
import sys
from dotenv import load_dotenv

# Ensure the 'project' directory is in the path so we can import clinical_ir
sys.path.append(os.path.join(os.getcwd(), "project"))

try:
    from clinical_ir import ClinicalIRSystem
except ImportError:
    print("Error: Could not find clinical_ir.py. Please run this from the project root directory.")
    sys.exit(1)

def main():
    load_dotenv()
    
    # Initialize the system (this will load models, might take a moment)
    print("--- Initializing system and loading models... ---")
    bot = ClinicalIRSystem()
    
    qrels_path = os.path.join(os.getcwd(), "project", "sample_qrels.json")
    if not os.path.exists(qrels_path):
        print(f"Error: {qrels_path} not found.")
        return

    models = ["hybrid", "bm25", "vsm", "boolean"]
    k_values = [1, 3, 5, 10]
    output_file = "evaluation_results.txt"
    
    with open(output_file, "w", encoding="utf-8") as f:
        f.write("# Clinical IR System Evaluation Results\n\n")
        
        for k in k_values:
            header = f"\n--- Running Evaluation at K={k} ---\n\n"
            print(header, end="")
            f.write(header)
            
            table_header = "| Model | Role | Precision@K | Recall@K |\n| :--- | :--- | :--- | :--- |\n"
            print(table_header, end="")
            f.write(table_header)
            
            for model in models:
                try:
                    # Run the internal evaluation logic
                    results = bot.evaluate_retrieval(qrels_path, top_k=k, model_type=model)
                    
                    # Helper to format and write row
                    def write_row(m_name, role, p, r):
                        row = f"| {m_name} | {role} | {p:.4f} | {r:.4f} |\n"
                        print(row, end="")
                        f.write(row)

                    # 1. Overall Only
                    write_row(f"**{model.upper()}**", "Overall", results["overall"]['avg_precision_at_k'], results["overall"]['avg_recall_at_k'])
                    
                    sep = "| --- | --- | --- | --- |\n"
                    print(sep, end="")
                    f.write(sep)
                    
                except Exception as e:
                    err_row = f"| **{model.upper()}** | Error | N/A | N/A |\n"
                    print(err_row, end="")
                    f.write(err_row)
                    print(f"DEBUG: {e}")

    print(f"\nResults have been saved to {output_file}")

if __name__ == "__main__":
    main()
