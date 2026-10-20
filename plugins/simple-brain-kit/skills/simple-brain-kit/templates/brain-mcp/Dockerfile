FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY brain_core.py server.py ./
# The runtime user comes from docker-compose (`user:`); the mounts decide what it may write.
USER 10001:10001
EXPOSE 8765
CMD ["python", "server.py"]
