package com.doable.config;

import java.io.IOException;
import java.time.Duration;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * Serves the Angular app when it's built into the jar (the single-container image in /Dockerfile).
 * Unknown paths like /today or /project/3 get index.html so the Angular router can handle them.
 * In local development the frontend has its own nginx container and none of this is used.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private static final Resource INDEX = new ClassPathResource("static/index.html");

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Angular's build files have a hash in their names, so browsers can keep them for a year.
        registry.addResourceHandler("/*.js", "/*.css", "/media/**")
                .addResourceLocations("classpath:/static/")
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());

        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/")
                .setCacheControl(CacheControl.noCache())
                .resourceChain(false)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String path, Resource location) throws IOException {
                        Resource found = location.createRelative(path);
                        if (found.exists() && found.isReadable()) return found;
                        if (path.startsWith("api/") || path.startsWith("actuator/")) return null;
                        return INDEX.exists() ? INDEX : null;
                    }
                });
    }
}
