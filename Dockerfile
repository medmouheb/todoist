# One container with the whole app: Spring Boot serves the API and the built Angular files.
# Used for hosting on a single service (Render, see deploy/DEPLOY-RENDER.md).
# Local development still uses compose.yaml with separate frontend and backend containers.

# 1. Build the Angular app
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx ng build --configuration production

# 2. Build the Spring Boot jar with the Angular files inside it
FROM maven:3.9-eclipse-temurin-21 AS api
WORKDIR /src
COPY backend/pom.xml ./
RUN mvn -q -B dependency:go-offline
COPY backend/src ./src
COPY --from=web /web/dist/frontend/browser ./src/main/resources/static
RUN mvn -q -B package -DskipTests

# 3. Run it with a small JRE, tuned to fit in 512 MB
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=api /src/target/app.jar app.jar
USER app
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=60 -XX:+UseSerialGC -XX:MaxMetaspaceSize=128m -Xss512k -XX:TieredStopAtLevel=1"
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=60s --retries=5 \
  CMD wget -qO- "http://localhost:${PORT:-8080}/actuator/health/liveness" | grep -q '"UP"' || exit 1
ENTRYPOINT ["java", "-jar", "app.jar"]
