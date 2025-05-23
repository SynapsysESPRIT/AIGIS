from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import os
import json
import traceback
from pathlib import Path
import random
import re
import torch
import subprocess
import tempfile
import base64 
import time
from tenacity import retry, stop_after_attempt, wait_exponential

from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from langchain.prompts import PromptTemplate
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.memory import ConversationBufferMemory
from langchain_community.vectorstores import FAISS
from langchain_community.document_loaders import TextLoader
from langchain.schema import HumanMessage

from elevenlabs.client import ElevenLabs  # Changed from TextToSpeechClient
from tqdm import tqdm
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, CSVLoader

# Initialize the ElevenLabs Client
elevenlabs_client = ElevenLabs(api_key=os.environ.get("ELEVENLABS_API_KEY"))  # Changed variable name and class

# Store globally initialized assistant
assistant_instance = None

# Store the assistant globally
assistant_instance = None

class ChildSafetyAssistant:
    def __init__(self, model_name: str = "meta-llama/llama-4-scout-17b-16e-instruct"):
        self.embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-mpnet-base-v2",
            model_kwargs={'device': 'cuda' if torch.cuda.is_available() else 'cpu'}
        )

        # Using smaller chunks for child-appropriate content
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=300,
            chunk_overlap=50
        )

        self.memory = ConversationBufferMemory(
            memory_key="chat_history",
            return_messages=True,
            output_key="answer"
        )
        self.vector_store = None
        self.chain = None
        self._setup_llm(model_name)
        
        # Fallback responses for when the model is unavailable
        self.fallback_responses = {
            "bullying": [
                "Sweetie, I'm so sorry you're going through this. Remember, you're not alone. The first thing to do is tell a trusted adult - like your parents, teacher, or school counselor. They can help you handle this situation safely.",
                "I understand this is really hard, dear. It's important to know that bullying is never okay. Let's talk to someone who can help you - like your parents or a teacher. They know how to handle these situations and keep you safe.",
                "This must be really difficult for you, honey. The most important thing is to tell a trusted adult about what's happening. They can help you and make sure it stops. You deserve to feel safe and happy."
            ],
            "general": [
                "Hi sweetie. I'm here to help you understand things that might be confusing or scary online. What specific question do you have?",
                "Hello, dear. I can see you have a question. Let me try to explain this in a way that's helpful and appropriate for you.",
                "Hi there. That's a good question. Let me share some helpful information that's right for your age."
            ]
        }

    def _setup_llm(self, model_name: str):
      print(f"Connecting to Groq model {model_name}...")

      self.llm = ChatGroq(
          model_name=model_name,
          temperature=0.7,
          max_tokens=512,
          top_p=0.95,
          groq_api_key=os.environ.get("GROQAPI_KEY"),
      )

      print("Mom Assistant model connected via Groq!")



    def load_documents(self, docs_dir: str):
        documents = []
        all_files = list(Path(docs_dir).rglob("*.*"))

        for file_path in tqdm(all_files, desc="Loading guidance materials"):
            if file_path.is_file():
                try:
                    if file_path.suffix.lower() == '.pdf':
                        loader = PyPDFLoader(str(file_path))
                        documents.extend(loader.load())
                    elif file_path.suffix.lower() in ['.docx', '.doc']:
                        loader = Docx2txtLoader(str(file_path))
                        documents.extend(loader.load())
                    elif file_path.suffix.lower() == '.txt':
                        loader = TextLoader(str(file_path))
                        documents.extend(loader.load())
                    elif file_path.suffix.lower() == '.csv':
                        loader = CSVLoader(str(file_path))
                        documents.extend(loader.load())
                except Exception as e:
                    print(f"Error loading {file_path}: {e}")

        if len(documents) == 0:
            print(f"No guidance documents found in {docs_dir}")
            return False

        return self._process_documents(documents)

    def _process_documents(self, documents):
        try:
            doc_chunks = self.text_splitter.split_documents(documents)
            self.vector_store = FAISS.from_documents(doc_chunks, self.embeddings)

            # Create a specialized chain
            self.custom_chain = self.create_custom_chain()
            return True
        except Exception as e:
            print(f"Error processing guidance documents: {e}")
            return False

    def create_custom_chain(self):
        template = """
        <|system|>
        You are a kind, gentle, and supportive assistant named "Mom Helper" designed to help young children (ages 6-12) who might encounter disturbing or inappropriate content online.

        Your personality traits:
        - Warm, nurturing, and maternal
        - Calming and reassuring
        - Empathetic and understanding
        - Protective but not alarmist
        - Positive and hopeful
        - Age-appropriate in language and tone

        Guidelines for your responses:
        1. Always prioritize the child's emotional wellbeing and safety
        2. Use simple, clear language suitable for young children
        3. Validate feelings while providing comfort and perspective
        4. Provide practical guidance for what to do next
        5. Encourage open communication with trusted adults
        6. Never use language that might frighten or shame the child
        7. Focus on empowerment and building resilience
        8. Include gentle reassurance in every response
        9. make the answers short and concise (max 5 - 8 sentences)

        Context information from safety guides is provided below to inform your responses:
        {context}

        Remember to maintain your warm, motherly tone even when addressing serious topics.
        </|system|>

        <|user|>
        {input}
        </|user|>

        <|assistant|>
        """

        from langchain.chains import create_retrieval_chain
        from langchain.chains.combine_documents import create_stuff_documents_chain

        prompt = PromptTemplate(
            template=template,
            input_variables=["context", "input"]
        )

        document_chain = create_stuff_documents_chain(self.llm, prompt)
        retrieval_chain = create_retrieval_chain(
            self.vector_store.as_retriever(search_kwargs={"k": 3}) if self.vector_store else None,
            document_chain
        )
        return retrieval_chain

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def _try_query_llm(self, filtered_question):
        """Attempt to query the LLM with retry logic"""
        try:
            result = self.custom_chain.invoke({"input": filtered_question})
            return result
        except Exception as e:
            print(f"Error in LLM query attempt: {e}")
            raise  # Let the retry decorator handle the retry

    def query(self, question: str) -> dict[str, any]:
        try:
            # First check if we have a vector store
            if self.vector_store is None:
                print("WARNING: Vector store is None, using fallback responses")
                return {
                    "answer": random.choice(self.fallback_responses["general"]),
                    "sources": []
                }

            # Filter potentially harmful content from the question
            filtered_question = self._filter_sensitive_content(question)
            print(f"Processing query: {filtered_question}")

            # Try to get a meaningful response using our custom chain with retry logic
            try:
                result = self._try_query_llm(filtered_question)
                print("Query processed successfully")
            except Exception as e:
                print(f"Error invoking chain after retries: {e}")
                # Select appropriate fallback response based on question content
                if any(word in question.lower() for word in ["bully", "bullied", "bullies", "mean", "hurt"]):
                    fallback = random.choice(self.fallback_responses["bullying"])
                else:
                    fallback = random.choice(self.fallback_responses["general"])
                
                return {
                    "answer": fallback + " (Note: I'm currently in basic mode. I'll try to help, but my answers might be limited.)",
                    "sources": []
                }

            # Extract the answer from the result
            answer = ""
            if "answer" in result:
                answer = result["answer"]
            elif "result" in result:
                answer = result["result"]
            else:
                for key, value in result.items():
                    if isinstance(value, str) and key != "input" and len(value) > 0:
                        answer = value
                        break

            if not answer:
                print("Warning: Could not extract answer from result")
                answer = "I'm here to help you understand things that might be confusing online. Could you tell me more about what you're asking?"

            # Clean up any model tags and formatting
            answer = re.sub(r'<\|system\|>.*?(?=<\|user\|>|<\|assistant\|>|$)', '', answer, flags=re.DOTALL).strip()
            answer = re.sub(r'<\|user\|>.*?(?=<\|assistant\|>|$)', '', answer, flags=re.DOTALL).strip()
            answer = re.sub(r'<\|assistant\|>', '', answer).strip()

            # Add signature phrases that a caring mother might use if not already present
            motherly_endings = [
                "Remember, I'm always here for you.",
                "You're doing great, and I'm proud of you.",
                "I'm sending you a big virtual hug.",
                "You're safe and loved.",
                "I believe in you.",
                "We'll figure this out together, okay?"
            ]
            if not any(ending in answer for ending in motherly_endings):
                answer += f"\n\n{random.choice(motherly_endings)}"

            # Add gentle name references if not already present
            name_references = ["sweetie", "dear", "honey", "sweetheart"]
            if not any(ref in answer.lower() for ref in name_references):
                sentences = answer.split('. ')
                if len(sentences) > 1:
                    sentences[1] = f"{random.choice(name_references).capitalize()}, {sentences[1].lower()}"
                    answer = '. '.join(sentences)

            # Get source documents for citation
            source_docs = []
            for key in ["context", "source_documents", "documents"]:
                if key in result and hasattr(result[key], "__iter__"):
                    source_docs = result[key]
                    break

            sources = []
            for doc in source_docs:
                if hasattr(doc, "metadata") and hasattr(doc, "page_content"):
                    content = doc.page_content.strip()
                    if len(content) > 150:
                        content = content[:150]

                    source_info = {
                        "content": content,
                        "source": doc.metadata.get("source", "Child Safety Guide")
                    }
                    sources.append(source_info)

            return {
                "answer": answer,
                "sources": sources
            }

        except Exception as e:
            print(f"Error in query: {e}")
            traceback.print_exc()
            # Provide a gentle fallback response
            return {
                "answer": "I'm here for you, sweetie. It seems I'm having a little trouble right now. Can you tell me again what you'd like help with?",
                "sources": []
            }

    def _filter_sensitive_content(self, text):
        """Filter potentially harmful or triggering content from input"""
        # This is a simple implementation - in production, use more sophisticated content filtering
        sensitive_words = [
            # Add words you want to filter from children's queries
            # This helps prevent the model from being exposed to harmful queries
        ]

        filtered_text = text
        for word in sensitive_words:
            filtered_text = filtered_text.replace(word, "[...]")

        return filtered_text

@csrf_exempt
def chatbot_view(request):
    try:
        if request.method == "POST":
            # Parse the incoming JSON request
            body = json.loads(request.body)
            question = body.get("question", "")

            if not question:
                return JsonResponse({"error": "No question provided."}, status=400)

            # Initialize the assistant
            assistant = ChildSafetyAssistant(model_name="meta-llama/llama-4-scout-17b-16e-instruct")

            # Load and process the safety guides
            guidance_path = Path("/content/drive/MyDrive/child_safety_guides")
            os.makedirs(guidance_path, exist_ok=True)

            basic_guide_path = guidance_path / "basic_online_safety.txt"
            if not basic_guide_path.exists():
                with open(basic_guide_path, "w") as f:
                    f.write("""
                    # Basic Online Safety Guide for Children

                    ## If You See Something Scary or Confusing Online

                    1. Close the screen or app right away
                    2. Take a deep breath and remember you're safe
                    3. Talk to a trusted adult about what you saw
                    4. Remember it's not your fault

                    ## Digital Safety Rules

                    * Never share personal information online
                    * Tell a grown-up if someone online makes you feel uncomfortable
                    * Don't click on pop-ups or unknown links
                    * Be kind online, just like in real life
                    * Ask before downloading anything

                    ## Dealing with Cyberbullying

                    * Save evidence of mean messages
                    * Don't respond to mean messages
                    * Block people who are being unkind
                    * Tell a trusted adult about what's happening

                    ## Healthy Screen Time

                    * Take regular breaks from screens
                    * Balance screen time with other activities
                    * Use devices in family areas, not alone in bedrooms
                    * Talk about what you enjoy doing online with your family
                    """)

            documents = []
            try:
                loader = TextLoader(str(basic_guide_path))
                documents.extend(loader.load())

                doc_chunks = assistant.text_splitter.split_documents(documents)
                assistant.vector_store = FAISS.from_documents(doc_chunks, assistant.embeddings)
                assistant.custom_chain = assistant.create_custom_chain()
            except Exception as e:
                print(f"Error processing documents: {e}")

            # Query the assistant
            response = assistant.query(question)
            answer = response.get("answer", "I'm here to help you.")

            # Try to generate audio with retry logic
            max_audio_retries = 2
            audio_retry_delay = 1  # seconds
            
            for attempt in range(max_audio_retries):
                try:
                    audio_stream = elevenlabs_client.text_to_speech.convert(
                        text=answer,
                        voice_id="EXAVITQu4vr4xnSDxMaL",
                        model_id="eleven_monolingual_v1"
                    )
                    
                    # Collect audio data from the generator
                    audio_bytes = b''
                    for chunk in audio_stream:
                        if chunk:
                            audio_bytes += chunk
                    
                    # Encode audio data to base64
                    audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
                    
                    return JsonResponse({
                        "answer": answer, 
                        "audio_data": audio_base64, 
                        "audio_format": "audio/mp3"
                    })
                    
                except Exception as e:
                    print(f"Error generating audio (attempt {attempt + 1}/{max_audio_retries}): {e}")
                    if attempt < max_audio_retries - 1:
                        time.sleep(audio_retry_delay)
                        continue
                    
                    # If all retries failed, return response without audio
                    return JsonResponse({
                        "answer": answer,
                        "error": "Audio generation is temporarily unavailable. Please try again later.",
                        "audio_available": False
                    })

        else:
            return render(request, 'chat_interface.html')

    except Exception as e:
        print(f"Error in chatbot_view: {e}")
        traceback.print_exc()
        return JsonResponse({
            "error": "I'm having trouble right now. Please try again in a few moments.",
            "details": str(e) if os.environ.get('DEBUG', 'False').lower() == 'true' else None
        }, status=500)
