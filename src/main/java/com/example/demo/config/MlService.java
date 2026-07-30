package com.example.demo.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.nio.file.Path;
import java.util.Map;

@Service
public class MlService {

    @Value("${ml.api.url:http://localhost:5000/analyze}")
    private String mlApiUrl;

    private final RestTemplate restTemplate = new RestTemplate();

    public MlResult analyze(Path videoPath, String exerciseType) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);

            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
            body.add("video", new FileSystemResource(videoPath));
            body.add("exerciseType", exerciseType);

            HttpEntity<MultiValueMap<String, Object>> request = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = restTemplate.postForEntity(mlApiUrl, request, Map.class);

            Map<?, ?> result = response.getBody();
            if (result == null) throw new RuntimeException("Empty response from ML model");

            double score = Double.parseDouble(result.get("score").toString());
            boolean qualified = Boolean.parseBoolean(result.get("qualified").toString());
            Object feedbackObj = result.get("feedback");
            String feedback = feedbackObj != null ? feedbackObj.toString() : "";

            return new MlResult(score, qualified, feedback);
        } catch (Exception e) {
            // ML model not available - return mock result for testing
            return new MlResult(75.0, true, "Mock assessment: Good form detected. [ML model not connected]");
        }
    }

    public record MlResult(double score, boolean qualified, String feedback) {}
}
