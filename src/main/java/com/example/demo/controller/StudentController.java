package com.example.demo.controller;

import com.example.demo.model.Student;
import com.example.demo.model.User;
import com.example.demo.repository.StudentRepository;
import com.example.demo.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/students")
public class StudentController {

    private final StudentRepository studentRepository;
    private final UserRepository userRepository;

    @Value("${app.upload.dir:./uploads}")
    private String uploadDir;

    public StudentController(StudentRepository studentRepository, UserRepository userRepository) {
        this.studentRepository = studentRepository;
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<?> getStudents(@RequestParam Long userId) {
        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found"));
        User user = userOpt.get();
        if (user.getRole() != User.Role.COACH) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only coaches can access student records"));
        }
        return ResponseEntity.ok(studentRepository.findByCoachId(userId));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> addStudent(
            @RequestParam Long userId,
            @RequestParam String name,
            @RequestParam int age,
            @RequestParam double height,
            @RequestParam double weight,
            @RequestParam String aadhaarNumber,
            @RequestParam MultipartFile aadhaarDoc) {

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found"));
        User user = userOpt.get();
        if (user.getRole() != User.Role.COACH) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only coaches can add students"));
        }
        if (aadhaarDoc == null || aadhaarDoc.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Aadhaar document is required"));
        }
        String originalName = aadhaarDoc.getOriginalFilename();
        if (originalName == null || !originalName.toLowerCase().endsWith(".pdf")) {
            return ResponseEntity.badRequest().body(Map.of("error", "Aadhaar document must be a PDF"));
        }

        Student student = new Student();
        student.setName(name);
        student.setAge(age);
        student.setHeight(height);
        student.setWeight(weight);
        student.setAadhaarNumber(aadhaarNumber);
        student.setCoach(user);

        if (aadhaarDoc != null && !aadhaarDoc.isEmpty()) {
            try {
                Path path = Paths.get(uploadDir, "aadhaar").toAbsolutePath().normalize();
                Files.createDirectories(path);
                String fileName = UUID.randomUUID() + ".pdf";
                Files.copy(aadhaarDoc.getInputStream(), path.resolve(fileName));
                student.setAadhaarDocPath("uploads/aadhaar/" + fileName);
            } catch (IOException e) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(Map.of("error", "Could not upload Aadhaar document: " + e.getMessage()));
            }
        }

        return ResponseEntity.ok(studentRepository.save(student));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteStudent(@PathVariable Long id, @RequestParam Long userId) {
        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found"));
        User user = userOpt.get();
        if (user.getRole() != User.Role.COACH) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only coaches can delete students"));
        }
        Optional<Student> studentOpt = studentRepository.findById(id);
        if (studentOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Student not found"));
        }
        Student student = studentOpt.get();
        if (!student.getCoach().getId().equals(userId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "You do not own this student profile"));
        }
        if (student.getAadhaarDocPath() != null) {
            try {
                String fileName = student.getAadhaarDocPath().substring(student.getAadhaarDocPath().lastIndexOf("/") + 1);
                Files.deleteIfExists(Paths.get(uploadDir, "aadhaar", fileName).toAbsolutePath());
            } catch (Exception ignored) {}
        }
        studentRepository.delete(student);
        return ResponseEntity.ok(Map.of("message", "Student deleted successfully"));
    }
}
