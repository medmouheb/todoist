package com.doable;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class DoableApplication {

    public static void main(String[] args) {
        SpringApplication.run(DoableApplication.class, args);
    }
}
